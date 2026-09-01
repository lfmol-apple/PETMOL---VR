#!/bin/bash
# Dispara a auditoria de identidade comercial (Cobasi x Shopee = mesmo
# produto). Script standalone (não inline no .service) pelo mesmo motivo
# do shopee-sync trigger: o parser de ExecStart= do systemd corrompe
# aspas escapadas antes do bash ver.
set -euo pipefail

API_ENV=/opt/petmol/shared/env/api.env
# Reusa o token do shopee-sync — mesma classe de operação de comércio
# (grava CommerceIdentityCheck, pode desativar ProductAffiliateLink).
TOKEN="$(grep '^SHOPEE_SYNC_TRIGGER_TOKEN=' "$API_ENV" | cut -d= -f2-)"

# Sem "gtins" → o endpoint monta a fila: links Cobasi cadastrados +
# ofertas Shopee ativas + GTINs usados pelos tutores. deactivate_hard_links
# default=true: link Cobasi apontando pra produto claramente diferente sai
# do ar; o resto vai pro relatório (GET .../commerce-identity/report).
curl -sf --max-time 120 -X POST http://127.0.0.1:8000/v1/admin/commerce-identity/run \
    -H "X-Sync-Token: ${TOKEN}" \
    -H 'Content-Type: application/json' \
    -d '{"deactivate_hard_links":true}'
