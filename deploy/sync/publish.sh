#!/bin/bash
# PETMOL Publish Script - Mac → VPS
# Usage: PETMOL_VPS_IP=147.93.33.24 PETMOL_DOMAIN=petmol.com.br bash deploy/sync/publish.sh
set -e

# ============================================
# Configuration (from ENV or defaults)
# ============================================
VPS_IP="${PETMOL_VPS_IP:-147.93.33.24}"
VPS_USER="${PETMOL_VPS_USER:-root}"
REMOTE_DIR="${PETMOL_REMOTE_DIR:-/opt/petmol}"
DOMAIN="${PETMOL_DOMAIN:-petmol.com.br}"
ALLOW_DIRTY="${PETMOL_ALLOW_DIRTY:-false}"
ALLOW_UNPUSHED="${PETMOL_ALLOW_UNPUSHED:-false}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[PETMOL]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ZIP_NAME="PETMOL.zip"
ZIP_PATH="/tmp/$ZIP_NAME"

log "============================================"
log "PETMOL Publish: $PROJECT_DIR → $VPS_USER@$VPS_IP"
log "============================================"

# ============================================
# Preflight: Git is the source of truth
# ============================================
cd "$PROJECT_DIR"

if git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    GIT_SHA="$(git rev-parse HEAD)"
    GIT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
    GIT_STATUS="$(git status --porcelain)"

    if [ -n "$GIT_STATUS" ] && [ "$ALLOW_DIRTY" != "true" ]; then
        git status --short
        error "Working tree is dirty. Commit or stash changes before deploy, or set PETMOL_ALLOW_DIRTY=true."
    fi

    if git rev-parse --abbrev-ref --symbolic-full-name @{u} > /dev/null 2>&1; then
        log "Checking upstream sync..."
        git fetch --quiet
        LOCAL_REV="$(git rev-parse @)"
        UPSTREAM_REV="$(git rev-parse @{u})"
        BASE_REV="$(git merge-base @ @{u})"

        if [ "$LOCAL_REV" != "$UPSTREAM_REV" ] && [ "$ALLOW_UNPUSHED" != "true" ]; then
            if [ "$LOCAL_REV" = "$BASE_REV" ]; then
                error "Local branch is behind upstream. Run git pull before deploy."
            elif [ "$UPSTREAM_REV" = "$BASE_REV" ]; then
                error "Local branch has unpushed commits. Push first, or set PETMOL_ALLOW_UNPUSHED=true."
            else
                error "Local branch and upstream diverged. Reconcile Git before deploy."
            fi
        fi
    else
        warn "No upstream configured for $GIT_BRANCH; cannot verify GitHub sync."
    fi

    log "Deploying commit $GIT_SHA ($GIT_BRANCH)"
else
    GIT_SHA="unknown"
    GIT_BRANCH="unknown"
    warn "Not inside a Git worktree; deploy revision will be unknown."
fi

# ============================================
# Step 1: Create ZIP (excluding node_modules, caches, etc)
# ============================================
log "Creating deployment package..."

rm -f "$ZIP_PATH"
zip -r "$ZIP_PATH" . \
    -x "node_modules/*" \
    -x "*/node_modules/*" \
    -x ".next/*" \
    -x "*/.next/*" \
    -x ".venv/*" \
    -x "*/.venv/*" \
    -x "__pycache__/*" \
    -x "*/__pycache__/*" \
    -x ".git/*" \
    -x ".expo/*" \
    -x "*/.expo/*" \
    -x ".gemini/*" \
    -x "*/.gemini/*" \
    -x ".pytest_cache/*" \
    -x "*/.pytest_cache/*" \
    -x "*.pyc" \
    -x ".DS_Store" \
    -x "*/.DS_Store" \
    -x "._*" \
    -x "Captura de Tela*.png" \
    -x "Pata 2.avif" \
    -x "pata.png" \
    -x "*.zip" \
    -x ".env" \
    -x ".env.local" \
    -x ".secrets/*" \
    -x "*/.secrets/*" \
    -x "services/price-service/push_subscriptions.json" \
    -x "*/.env" \
    -x "*/.env.local" \
    > /dev/null

ZIP_SIZE=$(du -h "$ZIP_PATH" | cut -f1)
log "Package created: $ZIP_PATH ($ZIP_SIZE)"

# ============================================
# Step 2: Upload to VPS
# ============================================
log "Uploading to VPS..."
scp "$ZIP_PATH" "$VPS_USER@$VPS_IP:$REMOTE_DIR/"

# ============================================
# Step 3: Run apply script on VPS
# ============================================
log "Applying on VPS..."
ssh "$VPS_USER@$VPS_IP" \
    "PETMOL_DEPLOY_SHA='$GIT_SHA' PETMOL_DEPLOY_BRANCH='$GIT_BRANCH' bash -s" \
    < "$SCRIPT_DIR/apply_on_vps.sh"

# ============================================
# Step 4: Sync uploads (fotos + documentos)
# ============================================
log "Syncing uploads..."
rsync -az \
    "$PROJECT_DIR/services/price-service/uploads/" \
    "$VPS_USER@$VPS_IP:$REMOTE_DIR/app/services/price-service/uploads/"
ssh "$VPS_USER@$VPS_IP" "chown -R petmol:petmol $REMOTE_DIR/app/services/price-service/uploads/"
log "Uploads synced and permissions fixed"

log "============================================"
log "✅ DEPLOY COMPLETE!"
log "============================================"
echo ""
echo "  Site:    https://$DOMAIN/"
echo "  API:     https://$DOMAIN/api/health"
echo "  Swagger: https://$DOMAIN/api/docs"
echo ""
