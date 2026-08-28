#!/bin/bash
# Refreshes the Awin Product Feed before any downstream marketplace sync.
# This keeps /commerce/offers from dropping Cobasi/Zee Now/Zee Dog because
# AwinFeedProvider intentionally refuses stale catalog data.
set -euo pipefail

SERVICE_DIR=/opt/petmol/current/services/price-service
PYTHON="$SERVICE_DIR/.venv/bin/python3"

cd "$SERVICE_DIR"
for merchant in cobasi zeenow zeedog; do
    echo "[petmol-awin-sync] syncing ${merchant}"
    PYTHONPATH=. "$PYTHON" scripts/sync_awin_feed.py "$merchant"
done
