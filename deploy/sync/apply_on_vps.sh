#!/bin/bash
# PETMOL Apply Script - Runs on VPS
# Called by publish.sh via SSH
set -e

# ============================================
# Configuration
# ============================================
REMOTE_DIR="/opt/petmol"
APP_DIR="$REMOTE_DIR/app"
ZIP_PATH="$REMOTE_DIR/PETMOL.zip"
TEMP_DIR="$REMOTE_DIR/PETMOL_new"
DEPLOY_SHA="${PETMOL_DEPLOY_SHA:-unknown}"
DEPLOY_BRANCH="${PETMOL_DEPLOY_BRANCH:-unknown}"

# ============================================
# Concurrency guard
# ============================================
# Two deploys landing on the VPS at once both write into the same
# node_modules/.next — a concurrent `npm ci` + `next build` collision
# corrupted the build once already (this script is invoked via `bash -s`
# over SSH, piped from stdin, so a plain "is another instance running" pidof
# check isn't reliable here — flock on a fixed fd is). GitHub Actions'
# concurrency group covers normal CI-triggered deploys; this covers any
# other way this script might get invoked (manual SSH run, retries, etc.).
LOCK_FILE="$REMOTE_DIR/.deploy.lock"
exec 200>"$LOCK_FILE"
if ! flock -n 200; then
    echo "Outro deploy ja esta em andamento neste VPS. Abortando para nao corromper node_modules/.next concorrente." >&2
    exit 1
fi

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[VPS]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[FAIL]${NC} $1"; }
pass() { echo -e "${GREEN}[PASS]${NC} $1"; }

wait_for_http() {
    local url="$1"
    local expected_pattern="$2"
    local attempts="${3:-15}"
    local delay_seconds="${4:-2}"
    local http_code=""

    for ((attempt = 1; attempt <= attempts; attempt++)); do
        http_code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || true)
        if [[ "$http_code" =~ $expected_pattern ]]; then
            echo "$http_code"
            return 0
        fi

        if [ "$attempt" -lt "$attempts" ]; then
            sleep "$delay_seconds"
        fi
    done

    echo "$http_code"
    return 1
}

wait_for_body() {
    local url="$1"
    local expected_text="$2"
    local attempts="${3:-15}"
    local delay_seconds="${4:-2}"
    local body=""

    for ((attempt = 1; attempt <= attempts; attempt++)); do
        body=$(curl -s "$url" 2>/dev/null || true)
        if echo "$body" | grep -q "$expected_text"; then
            echo "$body"
            return 0
        fi

        if [ "$attempt" -lt "$attempts" ]; then
            sleep "$delay_seconds"
        fi
    done

    echo "$body"
    return 1
}

log "============================================"
log "Applying PETMOL update on VPS"
log "============================================"

# ============================================
# Step 1: Unzip to temp directory
# ============================================
log "Extracting package..."
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"
unzip -q -o "$ZIP_PATH" -d "$TEMP_DIR"

# ============================================
# Step 2: Detect what changed
# ============================================
RESTART_API=false
RESTART_WEB=false

if [ -d "$APP_DIR" ]; then
    # Check if backend changed
    if ! diff -rq "$TEMP_DIR/services" "$APP_DIR/services" > /dev/null 2>&1; then
        RESTART_API=true
        log "Backend changes detected"
    fi

    # Check if frontend changed (excluding .next)
    if ! diff -rq "$TEMP_DIR/apps/web/src" "$APP_DIR/apps/web/src" > /dev/null 2>&1; then
        RESTART_WEB=true
        log "Frontend changes detected"
    fi
    if ! diff -q "$TEMP_DIR/apps/web/package.json" "$APP_DIR/apps/web/package.json" > /dev/null 2>&1; then
        RESTART_WEB=true
        log "Frontend package.json changed"
    fi
    if ! diff -rq "$TEMP_DIR/apps/web/public" "$APP_DIR/apps/web/public" > /dev/null 2>&1; then
        RESTART_WEB=true
        log "Frontend public/ changed"
    fi
else
    RESTART_API=true
    RESTART_WEB=true
    log "Fresh install - will start all services"
fi

# ============================================
# Step 2.5: Preserve legacy push subscriptions before rsync delete
# ============================================
LEGACY_SUBS_FILE="$APP_DIR/services/price-service/push_subscriptions.json"
CANONICAL_SUBS_FILE="${PUSH_SUBSCRIPTIONS_FILE:-/opt/petmol/logs/push_subscriptions.json}"

if [ -f "$LEGACY_SUBS_FILE" ]; then
    log "Migrating legacy push subscriptions to canonical store..."
    python3 - <<PY
import json
import os

legacy_path = os.path.abspath("$LEGACY_SUBS_FILE")
canonical_path = os.path.abspath("$CANONICAL_SUBS_FILE")

def read_json(path):
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r") as handle:
            data = json.load(handle)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}

def is_subscription(value):
    return isinstance(value, dict) and bool(value.get("endpoint"))

canonical = read_json(canonical_path)
legacy = read_json(legacy_path)
merged = dict(canonical)
for key, value in legacy.items():
    if key not in merged or is_subscription(value):
        merged[key] = value

os.makedirs(os.path.dirname(canonical_path), exist_ok=True)
with open(canonical_path, "w") as handle:
    json.dump(merged, handle)
PY
fi

# ============================================
# Step 3: Rsync to app directory (preserve .env files and secrets)
# ============================================
log "Syncing files..."
rsync -a --delete \
    --exclude '.env' \
    --exclude '.env.local' \
    --exclude '.secrets' \
    --exclude '.venv' \
    --exclude 'node_modules' \
    --exclude '.next' \
    --exclude 'services/price-service/uploads' \
    "$TEMP_DIR/" "$APP_DIR/"

# Remove stale local-only frontend env so production builds don't inherit
# old domains or developer overrides from previous deployments.
rm -f "$APP_DIR/apps/web/.env.local"

# Fix permissions
chown -R petmol:petmol "$APP_DIR" 2>/dev/null || true

# ============================================
# Step 4: Install dependencies if needed
# ============================================
if [ "$RESTART_API" = true ]; then
    log "Installing Python dependencies..."
    cd "$APP_DIR/services/price-service"
    if [ ! -d ".venv" ]; then
        python3 -m venv .venv
    fi
    .venv/bin/pip install -q --upgrade pip
    .venv/bin/pip install -q -e .
    .venv/bin/pip install -q uvicorn[standard]
fi

if [ "$RESTART_WEB" = true ]; then
    log "Installing npm dependencies..."
    cd "$APP_DIR"
    export NEXT_IGNORE_INCORRECT_LOCKFILE=1
    npm ci --legacy-peer-deps 2>/dev/null || npm install --legacy-peer-deps

    log "Building Next.js..."
    npm run web:build
fi

# ── Bump version.json so clients auto-reload onto the new build ────────────
# The client polls /version.json every 60s and force-reloads on change (see
# apps/web/src/app/home/page.tsx) — but version.json was a static file never
# touched by this pipeline, so that check always compared the same value and
# never fired. Every deploy since this mechanism was written has silently
# required users to manually close/reopen the app to get new code. Write a
# fresh value (the deploy SHA — unique per deploy, traceable) before the
# static-asset copy below so it reaches the standalone server too.
echo "{\"v\":\"$DEPLOY_SHA-$(date -u +%s)\"}" > "$APP_DIR/apps/web/public/version.json"

# ── ALWAYS copy static assets to standalone (critical for CSS/fonts) ────────
# Next.js standalone mode requires public/ and .next/static/ to be
# manually copied next to the server.js entry point, even if no rebuild occurred.
# This ensures CSS, fonts, and other assets are available when the app restarts.
log "Syncing static assets to standalone..."
STANDALONE="$APP_DIR/apps/web/.next/standalone/apps/web"
mkdir -p "$STANDALONE/.next"
rm -rf "$STANDALONE/.next/static" "$STANDALONE/public"
cp -r "$APP_DIR/apps/web/public"       "$STANDALONE/" 2>/dev/null || true
cp -r "$APP_DIR/apps/web/.next/static" "$STANDALONE/.next/" 2>/dev/null || true
# ──────────────────────────────────────────────────────────────────────────

# Fix permissions again after install
chown -R petmol:petmol "$APP_DIR" 2>/dev/null || true

# Record exactly which Git revision this production tree came from.
cat > "$APP_DIR/REVISION" <<EOF
sha=$DEPLOY_SHA
branch=$DEPLOY_BRANCH
deployed_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF
chown petmol:petmol "$APP_DIR/REVISION" 2>/dev/null || true

# ============================================
# Step 4.5: One-time reclassification (roda uma vez, flag impede repetição)
# ============================================
RECLASSIFY_FLAG="$REMOTE_DIR/.reclassify_baby_done"
if [ ! -f "$RECLASSIFY_FLAG" ]; then
    log "Reclassificando documentos do Baby com novo prompt Gemini..."
    VENV_PYTHON="$APP_DIR/services/price-service/.venv/bin/python"
    RECLASSIFY_SCRIPT="$APP_DIR/deploy/scripts/reclassify_pet_docs.py"
    if [ -f "$VENV_PYTHON" ] && [ -f "$RECLASSIFY_SCRIPT" ]; then
        cd "$APP_DIR/services/price-service"
        set -a; [ -f .env ] && source .env; set +a
        cd "$APP_DIR"
        "$VENV_PYTHON" "$RECLASSIFY_SCRIPT" --pet "Baby" \
            && touch "$RECLASSIFY_FLAG" \
            && log "Reclassificação do Baby concluída." \
            || warn "Reclassificação falhou — será tentada novamente no próximo deploy."
    else
        warn "venv ($VENV_PYTHON) ou script não encontrado — pulando."
    fi
fi

# When this whole script runs as root (automated GitHub Actions deploy uses
# a root SSH key), the reclassify step above compiles __pycache__/*.pyc as
# root — even on failure, since Python writes the bytecode cache before the
# import error surfaces. Those root-owned files then block `rsync --delete`
# on the next deploy that runs as `petmol` (manual recovery). Re-chown here,
# after the reclassify step, since the earlier chown (before Step 4.5) runs
# too early to catch this.
chown -R petmol:petmol "$APP_DIR" 2>/dev/null || true

# ============================================
# Step 5: Restart services
# ============================================
log "Restarting petmol-api..."
# `sudo` here isn't optional cosmetics: the petmol user restarting a system
# unit without it depends on polkit granting org.freedesktop.systemd1
# non-interactively for that session, and that grant is inconsistent across
# SSH session types — it silently failed with "Interactive authentication
# required" during manual recovery of this exact deploy, while automated
# CI sessions had been working. petmol has passwordless NOPASSWD:ALL sudo
# configured, so this removes the polkit dependency entirely instead of
# hoping the session type cooperates.
sudo systemctl restart petmol-api

# Always restart petmol-web, not just when RESTART_WEB (source changed) —
# version.json is regenerated on every deploy so clients auto-reload onto
# whatever's live, and the running Next.js standalone process needs a
# restart to actually pick that up (empirically: manually overwriting the
# file on disk without restarting still served a 404, on a deploy where
# only backend files changed). This is a cheap process restart, not a
# rebuild, so the cost of doing it unconditionally is negligible.
log "Restarting petmol-web..."
sudo systemctl restart petmol-web

# ============================================
# Step 6: Health checks (non-fatal — logs on failure)
# ============================================
log "Running health checks..."
TESTS_PASSED=0
TESTS_FAILED=0

# Test 1: API health
API_HEALTH_CODE=$(wait_for_http "http://127.0.0.1:8000/health" '^200$' 20 2) || API_HEALTH_CODE="ERR"
if [ "$API_HEALTH_CODE" = "200" ]; then
    pass "API health: OK"
    TESTS_PASSED=$((TESTS_PASSED+1))
else
    error "API health: HTTP ${API_HEALTH_CODE:-000}"
    TESTS_FAILED=$((TESTS_FAILED+1))
    warn "=== petmol-api journal (last 40 lines) ==="
    journalctl -u petmol-api --no-pager -n 40 || true
    warn "=== petmol-api status ==="
    systemctl status petmol-api --no-pager -l || true
fi

# Test 2: API version
API_VERSION=$(wait_for_body "http://127.0.0.1:8000/version" 'service' 10 1) || API_VERSION=""
if echo "$API_VERSION" | grep -q "service"; then
    pass "API /version: OK — $API_VERSION"
    TESTS_PASSED=$((TESTS_PASSED+1))
else
    error "API /version: failed"
    TESTS_FAILED=$((TESTS_FAILED+1))
fi

# Test 3: Suggest endpoint
SUGGEST_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:8000/suggest?q=racao&country=BR&limit=3") || SUGGEST_RESPONSE="ERR"
if [ "$SUGGEST_RESPONSE" = "200" ]; then
    pass "/suggest: 200 OK"
    TESTS_PASSED=$((TESTS_PASSED+1))
else
    error "/suggest: HTTP $SUGGEST_RESPONSE (expected 200)"
    TESTS_FAILED=$((TESTS_FAILED+1))
fi

# Test 4: Frontend home
FRONTEND_RESPONSE=$(wait_for_http "http://127.0.0.1:3000/" '^(200|307|308)$' 20 2) || FRONTEND_RESPONSE="ERR"
if [ "$FRONTEND_RESPONSE" = "200" ] || [ "$FRONTEND_RESPONSE" = "307" ] || [ "$FRONTEND_RESPONSE" = "308" ]; then
    pass "Frontend: HTTP $FRONTEND_RESPONSE OK"
    TESTS_PASSED=$((TESTS_PASSED+1))
else
    error "Frontend: HTTP $FRONTEND_RESPONSE"
    TESTS_FAILED=$((TESTS_FAILED+1))
    warn "=== petmol-web journal (last 40 lines) ==="
    journalctl -u petmol-web --no-pager -n 40 || true
    warn "=== petmol-web status ==="
    systemctl status petmol-web --no-pager -l || true
fi

# Test 5: sw.js (critical for push notifications)
SW_RESPONSE=$(wait_for_http "http://127.0.0.1:3000/sw.js" '^200$' 10 1) || SW_RESPONSE="ERR"
if [ "$SW_RESPONSE" = "200" ]; then
    pass "sw.js: 200 OK"
    TESTS_PASSED=$((TESTS_PASSED+1))
else
    error "sw.js: HTTP $SW_RESPONSE (push notifications will not work)"
    TESTS_FAILED=$((TESTS_FAILED+1))
fi

# Test 6: VAPID public key endpoint
VAPID_RESPONSE=$(wait_for_http "http://127.0.0.1:8000/notifications/vapid-public-key" '^200$' 10 1) || VAPID_RESPONSE="ERR"
if [ "$VAPID_RESPONSE" = "200" ]; then
    pass "VAPID key endpoint: 200 OK"
    TESTS_PASSED=$((TESTS_PASSED+1))
else
    error "VAPID key endpoint: HTTP $VAPID_RESPONSE"
    TESTS_FAILED=$((TESTS_FAILED+1))
fi

# ============================================
# Step 7: Summary
# ============================================
echo ""
log "============================================"
if [ "$TESTS_FAILED" = "0" ]; then
    log "✅ ALL $TESTS_PASSED TESTS PASSED — deploy successful!"
else
    error "⚠ $TESTS_FAILED/$((TESTS_PASSED + TESTS_FAILED)) tests failed"
    log "Passed: $TESTS_PASSED | Failed: $TESTS_FAILED"
    exit 1
fi
log "============================================"

# Cleanup
rm -rf "$TEMP_DIR"
rm -f "$ZIP_PATH"
