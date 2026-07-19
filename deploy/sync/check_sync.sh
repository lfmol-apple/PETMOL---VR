#!/bin/bash
# PETMOL sync audit: local Git, GitHub upstream, and VPS deployment.
set -e

VPS_IP="${PETMOL_VPS_IP:-147.93.33.24}"
VPS_USER="${PETMOL_VPS_USER:-root}"
REMOTE_DIR="${PETMOL_REMOTE_DIR:-/opt/petmol}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[CHECK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_DIR"

git rev-parse --is-inside-work-tree > /dev/null 2>&1 || fail "Not inside a Git worktree."

LOCAL_SHA="$(git rev-parse HEAD)"
LOCAL_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

log "Local branch: $LOCAL_BRANCH"
log "Local commit: $LOCAL_SHA"

if [ -n "$(git status --porcelain)" ]; then
    git status --short
    fail "Local working tree has uncommitted changes."
fi

if git rev-parse --abbrev-ref --symbolic-full-name @{u} > /dev/null 2>&1; then
    git fetch --quiet
    UPSTREAM_SHA="$(git rev-parse @{u})"
    log "Upstream commit: $UPSTREAM_SHA"
    [ "$LOCAL_SHA" = "$UPSTREAM_SHA" ] || fail "Local commit differs from upstream."
else
    warn "No upstream configured; skipping GitHub comparison."
fi

REMOTE_REVISION="$(ssh "$VPS_USER@$VPS_IP" "cat '$REMOTE_DIR/app/REVISION' 2>/dev/null || true")"
REMOTE_SHA="$(printf '%s\n' "$REMOTE_REVISION" | awk -F= '$1 == "sha" {print $2}')"

if [ -z "$REMOTE_SHA" ]; then
    warn "Production REVISION file is missing; falling back to rsync checksum comparison."
else
    log "Production commit: $REMOTE_SHA"
    [ "$LOCAL_SHA" = "$REMOTE_SHA" ] || fail "Production commit differs from local/upstream."
fi

RSYNC_DIFF="$(rsync -anic --delete \
    --exclude '.git' \
    --exclude '.gitignore' \
    --exclude '.github' \
    --exclude '.env' \
    --exclude '.env.local' \
    --exclude '.env.production' \
    --exclude '.secrets' \
    --exclude '.venv' \
    --exclude 'services/price-service/petmol.db*' \
    --exclude 'node_modules' \
    --exclude '.next' \
    --exclude 'services/price-service/uploads' \
    --exclude 'services/price-service/push_subscriptions.json' \
    --exclude 'uploads' \
    --exclude '__pycache__' \
    --exclude '*.pyc' \
    --exclude '.pytest_cache' \
    --exclude '.DS_Store' \
    --exclude '._*' \
    --exclude '.claude' \
    --exclude 'analysis' \
    --exclude 'functions/lib' \
    --exclude 'services/product-suggest/dist' \
    --exclude 'services/price-service/src/petmol_price_service.egg-info' \
    --exclude 'services/price-service/tests' \
    --exclude 'services/price-service/src/ongs' \
    --exclude 'functions/.gitignore' \
    --exclude 'services/price-service/.gitignore' \
    --exclude 'services/price-service/.env.example' \
    --exclude 'REVISION' \
    --exclude 'apps/web/public/version.json' \
    --exclude 'apps/web/public/icons/.gitkeep' \
    --exclude 'apps/web/tsconfig.tsbuildinfo' \
    "$VPS_USER@$VPS_IP:$REMOTE_DIR/app/" ./)"

MEANINGFUL_DIFF="$(printf '%s\n' "$RSYNC_DIFF" | awk '$0 !~ /^\.d\.\.t/ && $0 !~ /^\.f\.\.t/ && NF {print}')"
if [ -n "$MEANINGFUL_DIFF" ]; then
    printf '%s\n' "$MEANINGFUL_DIFF"
    fail "Production files differ from local checkout."
fi

log "OK: local, upstream, and production are synchronized."
