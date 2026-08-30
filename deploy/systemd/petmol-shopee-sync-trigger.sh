#!/bin/bash
# Fires the Shopee sync HTTP trigger. Kept as a standalone script (not
# inlined in the .service file) because systemd's own ExecStart= line
# parser mangles backslash-escaped quotes before bash ever sees them —
# inlining the JSON body there produced corrupted, invalid JSON.
set -euo pipefail

API_ENV=/opt/petmol/shared/env/api.env
TOKEN="$(grep '^SHOPEE_SYNC_TRIGGER_TOKEN=' "$API_ENV" | cut -d= -f2-)"

# source=categories: sincroniza os produtos das categorias pet do
# catálogo (food/antiparasite/medication/hygiene/dewormer/collar) direto
# por GTIN, SEM depender do feed Awin (que hoje está off — por isso o
# job antigo, source=awin_feed_all, se recusava a rodar). skip_existing=
# false: re-casa e re-precifica TODA oferta ativa toda noite, então
# preço fica fresco e um match que o matcher (melhorado 30/08) passou a
# rejeitar é desativado no próximo ciclo. Ver docs/LAUNCH.md §7.
curl -sf --max-time 120 -X POST http://127.0.0.1:8000/v1/admin/shopee-sync/run \
    -H "X-Sync-Token: ${TOKEN}" \
    -H 'Content-Type: application/json' \
    -d '{"source":"categories","skip_existing_shopee":false}'
