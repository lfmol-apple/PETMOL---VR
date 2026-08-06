#!/bin/bash
# PETMOL — one-time migration helper: legacy /opt/petmol/app layout ->
# atomic releases (/opt/petmol/releases + /opt/petmol/current + /opt/petmol/shared).
#
# This is NOT run automatically by any pipeline. Run it by hand, once, over
# SSH, after reading it — then follow the printed next steps. It only ever
# copies data into shared/ (never deletes or modifies the legacy app dir),
# so the legacy layout keeps working as a fallback until you're confident
# in the new one.
set -euo pipefail

ROOT="/opt/petmol"
LEGACY_APP="$ROOT/app"
SHARED_DIR="$ROOT/shared"
CURRENT_LINK="$ROOT/current"

[ -d "$LEGACY_APP" ] || { echo "Legacy app dir $LEGACY_APP not found — nothing to migrate." >&2; exit 1; }
[ -L "$CURRENT_LINK" ] && { echo "$CURRENT_LINK already exists — migration already done?" >&2; exit 1; }

SHA="$(awk -F= '$1=="sha"{print $2}' "$LEGACY_APP/REVISION" 2>/dev/null || echo unknown)"
echo "Legacy production is at sha=$SHA. Copying persistent data into $SHARED_DIR..."

mkdir -p "$SHARED_DIR/env" "$SHARED_DIR/uploads" "$SHARED_DIR/logs" "$SHARED_DIR/persistent" "$SHARED_DIR/venv"

[ -f "$LEGACY_APP/services/price-service/.env" ] && \
    cp -n "$LEGACY_APP/services/price-service/.env" "$SHARED_DIR/env/api.env"
[ -f "$LEGACY_APP/apps/web/.env.local" ] && \
    cp -n "$LEGACY_APP/apps/web/.env.local" "$SHARED_DIR/env/web.env.local"
[ -d "$LEGACY_APP/services/price-service/uploads" ] && \
    rsync -a "$LEGACY_APP/services/price-service/uploads/" "$SHARED_DIR/uploads/"
[ -f "$LEGACY_APP/services/price-service/push_subscriptions.json" ] && \
    cp -n "$LEGACY_APP/services/price-service/push_subscriptions.json" "$SHARED_DIR/persistent/push_subscriptions.json"
if [ -f "/opt/petmol/logs/push_subscriptions.json" ]; then
    cp -n "/opt/petmol/logs/push_subscriptions.json" "$SHARED_DIR/persistent/push_subscriptions.json"
fi
[ -d "$LEGACY_APP/services/price-service/.venv" ] && \
    rsync -a "$LEGACY_APP/services/price-service/.venv/" "$SHARED_DIR/venv/"

echo ""
echo "Copied into $SHARED_DIR. Legacy files at $LEGACY_APP were left untouched."
echo ""
echo "Manual next steps (do not automate — verify each one before moving on):"
echo "  1. Trigger the 'Build & Package' CI job for the commit you want live"
echo "     (push to main, or re-run CI for an existing commit)."
echo "  2. Run the 'Deploy -> VPS (atomic releases)' workflow (workflow_dispatch)"
echo "     with that commit's SHA — it uploads the artifact and runs:"
echo "       PETMOL_DEPLOY_SHA=<sha> bash deploy/release/activate.sh <tarball>"
echo "  3. Confirm https://petmol.com.br/api/health and https://www.petmol.com.br/"
echo "     both respond correctly, and that /opt/petmol/REVISION shows the sha."
echo "  4. Install the new unit files:"
echo "       cp deploy/systemd/petmol-api.service deploy/systemd/petmol-web.service /etc/systemd/system/"
echo "       systemctl daemon-reload"
echo "     (the old units already point at paths under /opt/petmol/app — replacing"
echo "     them only takes effect on the next restart, which activate.sh triggers)"
echo "  5. Only once you've confirmed the new layout is healthy end-to-end,"
echo "     consider archiving/removing $LEGACY_APP and the legacy timer/scripts."
