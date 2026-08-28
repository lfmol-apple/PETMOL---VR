#!/bin/bash
# Fires the Shopee sync HTTP trigger. Kept as a standalone script (not
# inlined in the .service file) because systemd's own ExecStart= line
# parser mangles backslash-escaped quotes before bash ever sees them —
# inlining the JSON body there produced corrupted, invalid JSON.
set -euo pipefail

API_ENV=/opt/petmol/shared/env/api.env
TOKEN="$(grep '^SHOPEE_SYNC_TRIGGER_TOKEN=' "$API_ENV" | cut -d= -f2-)"

curl -sf --max-time 60 -X POST http://127.0.0.1:8000/v1/admin/shopee-sync/run \
    -H "X-Sync-Token: ${TOKEN}" \
    -H 'Content-Type: application/json' \
    -d '{"source":"awin_feed_all","feed_merchants":["cobasi","zeenow","zeedog"],"skip_existing_shopee":true,"audit_existing_shopee":true,"deactivate_invalid_shopee":true,"audit_max_rows":500}'
