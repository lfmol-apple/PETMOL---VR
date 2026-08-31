#!/bin/bash
# Fires the Shopee sync HTTP trigger. Kept as a standalone script (not
# inlined in the .service file) because systemd's own ExecStart= line
# parser mangles backslash-escaped quotes before bash ever sees them —
# inlining the JSON body there produced corrupted, invalid JSON.
set -euo pipefail

API_ENV=/opt/petmol/shared/env/api.env
TOKEN="$(grep '^SHOPEE_SYNC_TRIGGER_TOKEN=' "$API_ENV" | cut -d= -f2-)"

# source=active_products: fila noturna determinística em prioridades —
#   A) TODA oferta Shopee ativa (revalida/reprecifica, da mais antiga
#      pra mais nova; nunca apaga a oferta se a API falhar);
#   B) GTINs que os tutores de fato usam (product_scan_events resolvidos
#      num produto de catálogo com nome — ração/antipulgas/vermífugo/
#      higiene/medicação/coleira), só com GTIN confiável;
#   C) catálogo comercial Awin fresco (Cobasi/Zee Now/Zee Dog), só o que
#      ainda não tem oferta Shopee.
# Deduplicado por GTIN, com teto por execução (SHOPEE_SYNC_MAX_PRODUCTS_
# PER_RUN) — se bater o teto, para limpo e a próxima noite continua.
# Ver docs/LAUNCH.md §7 e admin/shopee_sync_router.py.
curl -sf --max-time 120 -X POST http://127.0.0.1:8000/v1/admin/shopee-sync/run \
    -H "X-Sync-Token: ${TOKEN}" \
    -H 'Content-Type: application/json' \
    -d '{"source":"active_products"}'
