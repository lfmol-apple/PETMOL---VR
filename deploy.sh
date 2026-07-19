#!/bin/bash
# Deploy completo: sincroniza src local → VPS e rebuilda
# Uso: bash deploy.sh [web|api|all]  (padrão: web)
set -e

TARGET=${1:-web}
VPS="root@147.93.33.24"
APP_REMOTE="/opt/petmol/app"
APP_LOCAL="$(cd "$(dirname "$0")" && pwd)"

deploy_web() {
  echo "🔄 Sincronizando arquivos web..."
  # Atualiza timestamp do version.json a cada deploy
  TS=$(date -u +%s)
  echo "{\"v\":\"$TS\"}" > "$APP_LOCAL/apps/web/public/version.json"

  rsync -az --checksum \
    --exclude='.next' \
    --exclude='node_modules' \
    --exclude='.env*' \
    -e "ssh -i ~/.ssh/id_ed25519" \
    "$APP_LOCAL/apps/web/" \
    "$VPS:$APP_REMOTE/apps/web/"

  echo "🏗️  Buildando no servidor..."
  ssh -i ~/.ssh/id_ed25519 "$VPS" "bash /opt/petmol/deploy_web.sh"

  echo "📋 Copiando sw.js e version.json para standalone..."
  ssh -i ~/.ssh/id_ed25519 "$VPS" "
    cp $APP_REMOTE/apps/web/public/sw.js $APP_REMOTE/apps/web/.next/standalone/apps/web/public/sw.js
    cp $APP_REMOTE/apps/web/public/version.json $APP_REMOTE/apps/web/.next/standalone/apps/web/public/version.json
  "

  echo "✅ Deploy web concluído."
}

deploy_api() {
  echo "🔄 Sincronizando API..."
  rsync -az --checksum \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='.venv' \
    --exclude='.env*' \
    --exclude='uploads/' \
    -e "ssh -i ~/.ssh/id_ed25519" \
    "$APP_LOCAL/services/price-service/" \
    "$VPS:$APP_REMOTE/services/price-service/"
  ssh -i ~/.ssh/id_ed25519 "$VPS" "systemctl restart petmol-api"
  echo "✅ Deploy API concluído."
}

case "$TARGET" in
  web) deploy_web ;;
  api) deploy_api ;;
  all) deploy_web; deploy_api ;;
  *) echo "Uso: bash deploy.sh [web|api|all]"; exit 1 ;;
esac
