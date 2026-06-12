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
# Step 1: Create ZIP (excluding node_modules, caches, etc)
# ============================================
log "Creating deployment package..."
cd "$PROJECT_DIR"

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
ssh "$VPS_USER@$VPS_IP" "bash -s" < "$SCRIPT_DIR/apply_on_vps.sh"

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
