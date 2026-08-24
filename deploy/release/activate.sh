#!/bin/bash
# PETMOL — atomic release activation. Runs on the VPS via SSH.
#
# Given a release tarball already uploaded to the VPS, this:
#   1. extracts it into releases/<sha>                (no lock — can be slow)
#   2. links shared/persistent paths into the release  (no lock)
#   3. installs backend deps into the SHARED venv, but only if requirements
#      changed (no lock — this is the one step that can be slow)
#   4. acquires a short-lived lock only for: swap the `current` symlink,
#      restart services, run essential health checks
#   5. rolls back automatically if essential health checks fail
#   6. runs optional health checks as warnings (never blocks)
#   7. prunes old releases
#
# Usage: PETMOL_DEPLOY_SHA=<sha> bash activate.sh <tarball-path>
set -euo pipefail

ROOT="/opt/petmol"
RELEASES_DIR="$ROOT/releases"
SHARED_DIR="$ROOT/shared"
CURRENT_LINK="$ROOT/current"
LOCK_FILE="$ROOT/.activate.lock"
KEEP_RELEASES=5

SHA="${PETMOL_DEPLOY_SHA:?PETMOL_DEPLOY_SHA is required}"
TARBALL="${1:?usage: activate.sh <tarball-path>}"
RELEASE_DIR="$RELEASES_DIR/$SHA"

log()  { echo "[activate] $*"; }
fail() { echo "[activate][FAIL] $*" >&2; exit 1; }

[ -f "$TARBALL" ] || fail "tarball not found: $TARBALL"

mkdir -p "$RELEASES_DIR" "$SHARED_DIR/env" "$SHARED_DIR/uploads" "$SHARED_DIR/logs" \
    "$SHARED_DIR/persistent" "$SHARED_DIR/venv"

# ── Step 1: extract (outside lock) ──────────────────────────────────────────
if [ -d "$RELEASE_DIR" ]; then
    log "Release $SHA already extracted — redeploying same SHA, replacing directory."
    rm -rf "$RELEASE_DIR"
fi
mkdir -p "$RELEASE_DIR"
tar -xzf "$TARBALL" -C "$RELEASE_DIR"

[ -f "$RELEASE_DIR/manifest.json" ] || fail "manifest.json missing from release — corrupt/incomplete artifact."
MANIFEST_SHA="$(python3 -c "import json;print(json.load(open('$RELEASE_DIR/manifest.json'))['sha'])" 2>/dev/null || true)"
[ "$MANIFEST_SHA" = "$SHA" ] || fail "manifest sha ($MANIFEST_SHA) does not match requested sha ($SHA)."

# ── Step 2: link shared/persistent paths into the release (outside lock) ───
ln -sfn "$SHARED_DIR/env/api.env" "$RELEASE_DIR/services/price-service/.env"
[ -f "$SHARED_DIR/env/web.env.local" ] && ln -sfn "$SHARED_DIR/env/web.env.local" "$RELEASE_DIR/apps/web/.env.local"
ln -sfn "$SHARED_DIR/uploads" "$RELEASE_DIR/services/price-service/uploads"
touch "$SHARED_DIR/persistent/push_subscriptions.json"
ln -sfn "$SHARED_DIR/persistent/push_subscriptions.json" "$RELEASE_DIR/services/price-service/push_subscriptions.json"
ln -sfn "$SHARED_DIR/venv" "$RELEASE_DIR/services/price-service/.venv"

chown -R petmol:petmol "$RELEASE_DIR" 2>/dev/null || true

# ── Step 3: backend deps — only reinstall shared venv if requirements changed
# (outside lock: this is the one step in the old pipeline that made every
# deploy slow and made the lock-holding window unpredictable) ──────────────
REQS_HASH_FILE="$SHARED_DIR/venv/.requirements.sha256"
NEW_HASH="$(sha256sum "$RELEASE_DIR/services/price-service/requirements.txt" | awk '{print $1}')"
OLD_HASH="$(cat "$REQS_HASH_FILE" 2>/dev/null || true)"

if [ ! -x "$SHARED_DIR/venv/bin/python" ] || [ "$NEW_HASH" != "$OLD_HASH" ]; then
    log "Backend dependencies changed (or venv missing) — installing into shared venv..."
    [ -x "$SHARED_DIR/venv/bin/python" ] || python3 -m venv "$SHARED_DIR/venv"
    "$SHARED_DIR/venv/bin/pip" install -q --upgrade pip
    "$SHARED_DIR/venv/bin/pip" install -q -r "$RELEASE_DIR/services/price-service/requirements.txt"
    "$SHARED_DIR/venv/bin/pip" install -q -e "$RELEASE_DIR/services/price-service"
    echo "$NEW_HASH" > "$REQS_HASH_FILE"
    chown -R petmol:petmol "$SHARED_DIR/venv" 2>/dev/null || true
else
    log "Backend dependencies unchanged — reusing shared venv."
fi

# ════════════════════════════════════════════════════════════════════════
# Everything below this line is the short, locked activation step. Nothing
# above holds the lock: upload, extraction, and dependency install are the
# slow/variable-duration parts, and none of them need mutual exclusion —
# each release gets its own directory, and the shared venv install is
# idempotent (safe to race on the hash file at worst causing one redundant
# reinstall, never corruption, since pip install is itself atomic per file).
# ════════════════════════════════════════════════════════════════════════
exec 200>>"$LOCK_FILE"
if ! flock -w 30 200; then
    fail "Could not acquire activation lock within 30s — another activation is in progress."
fi
echo "pid=$$ sha=$SHA at=$(date -u +%FT%TZ)" > "$LOCK_FILE"

PREVIOUS_SHA=""
if [ -L "$CURRENT_LINK" ]; then
    PREVIOUS_SHA="$(basename "$(readlink "$CURRENT_LINK")")"
fi

log "Activating release $SHA (previous: ${PREVIOUS_SHA:-none})..."
ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"

log "Installing systemd units..."
if compgen -G "$RELEASE_DIR/deploy/systemd/*.service" >/dev/null; then
    cp "$RELEASE_DIR"/deploy/systemd/*.service /etc/systemd/system/
fi
if compgen -G "$RELEASE_DIR/deploy/systemd/*.timer" >/dev/null; then
    cp "$RELEASE_DIR"/deploy/systemd/*.timer /etc/systemd/system/
fi
systemctl daemon-reload
if compgen -G "$RELEASE_DIR/deploy/systemd/*.timer" >/dev/null; then
    for timer_path in "$RELEASE_DIR"/deploy/systemd/*.timer; do
        systemctl enable --now "$(basename "$timer_path")"
    done
fi

log "Restarting services..."
systemctl restart petmol-api
systemctl restart petmol-web

log "Running essential health checks..."
if bash "$RELEASE_DIR/deploy/release/health_check.sh" essential; then
    log "Essential health checks passed."
    echo "sha=$SHA activated_at=$(date -u +%FT%TZ)" > "$ROOT/REVISION"
    rm -f "$LOCK_FILE"
else
    log "Essential health checks FAILED — rolling back to ${PREVIOUS_SHA:-<none>}."
    if [ -n "$PREVIOUS_SHA" ] && [ -d "$RELEASES_DIR/$PREVIOUS_SHA" ]; then
        ln -sfn "$RELEASES_DIR/$PREVIOUS_SHA" "$CURRENT_LINK"
        systemctl restart petmol-api
        systemctl restart petmol-web
        bash "$RELEASES_DIR/$PREVIOUS_SHA/deploy/release/health_check.sh" essential || true
        echo "sha=$PREVIOUS_SHA activated_at=$(date -u +%FT%TZ) rolled_back_from=$SHA" > "$ROOT/REVISION"
    else
        log "No previous release available to roll back to — production is left on the failed activation."
    fi
    rm -f "$LOCK_FILE"
    fail "Activation of $SHA failed essential health checks."
fi

# ── Step 6: optional health checks — warnings only, never fail the deploy ──
log "Running non-essential health checks (warnings only)..."
bash "$RELEASE_DIR/deploy/release/health_check.sh" optional || log "Some optional checks failed — see above. Not blocking."

# ── Step 7: prune old releases (outside lock) ───────────────────────────────
log "Pruning old releases (keeping last $KEEP_RELEASES)..."
cd "$RELEASES_DIR"
ls -1t | tail -n +$((KEEP_RELEASES + 1)) | while read -r old; do
    [ "$old" = "$SHA" ] && continue
    log "Removing old release: $old"
    rm -rf "${RELEASES_DIR:?}/${old:?}"
done

log "Deploy of $SHA complete."
