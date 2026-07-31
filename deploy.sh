#!/bin/bash
# DEPLOY PRIMÁRIO: git push origin <branch> — dispara .github/workflows/deploy.yml
# (GitHub Actions builda e envia via SSH a partir de runners na nuvem, sem
# depender da rede/IP da máquina local). Esse é o caminho usado em produção.
#
# Este script é só para deploys manuais/emergenciais quando o push automático
# não é uma opção (ex: testar algo rápido antes de commitar).
# Uso: bash deploy.sh [web|api|all|local-web]  (padrão: web)
#   local-web: build local + envio direto via SSH (fallback de emergência,
#              exige que a porta 22 do VPS esteja acessível da máquina local)
set -e

TARGET=${1:-web}
VPS_HOST="147.93.33.24"
VPS_USER="root"
SSH_KEY="$HOME/.ssh/id_ed25519"
VPS_SERVICE="petmol-web"
VPS_APP_URL="https://www.petmol.com.br"

SSH_PORT=22
VPS="$VPS_USER@$VPS_HOST"
APP_REMOTE="/opt/petmol/app"
APP_LOCAL="$(cd "$(dirname "$0")" && pwd)"

# SSH com retry automático: tenta por até 8 minutos antes de desistir
ssh_retry() {
  local max_wait=480
  local elapsed=0
  local delay=10
  while true; do
    if ssh -i "$SSH_KEY" -p "$SSH_PORT" \
        -o ConnectTimeout=15 \
        -o BatchMode=yes \
        -o ServerAliveInterval=10 \
        -o ServerAliveCountMax=3 \
        "$@" 2>/dev/null; then
      return 0
    fi
    elapsed=$((elapsed + delay))
    if [ $elapsed -ge $max_wait ]; then
      echo "❌ SSH não respondeu após ${max_wait}s. Verifique o VPS."
      return 1
    fi
    echo "⏳ SSH ocupado (bots). Próxima tentativa em ${delay}s... (${elapsed}/${max_wait}s)"
    sleep $delay
    delay=$((delay < 40 ? delay + 10 : 40))
  done
}

rsync_retry() {
  ssh_retry -o "ControlMaster=no" "$VPS" "exit" || return 1
  rsync -az --checksum \
    -e "ssh -i $SSH_KEY -p $SSH_PORT -o BatchMode=yes -o ConnectTimeout=15" \
    "$@"
}

deploy_web() {
  echo "🔄 Sincronizando arquivos web..."
  TS=$(date -u +%s)
  echo "{\"v\":\"$TS\"}" > "$APP_LOCAL/apps/web/public/version.json"

  # Garante conectividade com retry
  ssh_retry "$VPS" "exit"

  rsync_retry \
    --exclude='.next' \
    --exclude='node_modules' \
    --exclude='.env*' \
    "$APP_LOCAL/apps/web/" \
    "$VPS:$APP_REMOTE/apps/web/"

  echo "🏗️  Buildando no servidor..."
  ssh_retry "$VPS" "bash /opt/petmol/deploy_web.sh"

  echo "📋 Copiando sw.js e version.json para standalone..."
  ssh_retry "$VPS" "
    cp $APP_REMOTE/apps/web/public/sw.js $APP_REMOTE/apps/web/.next/standalone/apps/web/public/sw.js
    cp $APP_REMOTE/apps/web/public/version.json $APP_REMOTE/apps/web/.next/standalone/apps/web/public/version.json
  "

  echo "✅ Deploy web concluído."
}

deploy_api() {
  echo "🔄 Sincronizando API..."
  ssh_retry "$VPS" "exit"
  rsync_retry \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='.venv' \
    --exclude='.env*' \
    --exclude='petmol.db*' \
    --exclude='uploads/' \
    "$APP_LOCAL/services/price-service/" \
    "$VPS:$APP_REMOTE/services/price-service/"
  ssh_retry "$VPS" "systemctl restart petmol-api"
  echo "✅ Deploy API concluído."
}

deploy_local_web() {
  echo "🏗️  Build local..."
  APP_WEB="$APP_LOCAL/apps/web"
  TS=$(date -u +%s)
  echo "{\"v\":\"$TS\"}" > "$APP_WEB/public/version.json"

  cd "$APP_WEB" && npm run build

  STANDALONE="$APP_WEB/.next/standalone"
  echo "{\"v\":\"$TS\"}" > "$STANDALONE/apps/web/public/version.json"

  echo "📦 Empacotando standalone..."
  TARBALL="/tmp/petmol-standalone-$TS.tar.gz"
  COPYFILE_DISABLE=1 tar -czf "$TARBALL" --no-xattrs -C "$APP_WEB" .next/standalone 2>/dev/null || \
    COPYFILE_DISABLE=1 tar -czf "$TARBALL" -C "$APP_WEB" .next/standalone
  echo "Tamanho: $(du -sh "$TARBALL" | cut -f1)"

  echo "🚀 Enviando para VPS via SSH..."
  # SSH porta 22 (porta 2222 bloqueada externamente)
  SSH_OPTS="-i $SSH_KEY -p 22 -o ConnectTimeout=30 -o BatchMode=yes -o StrictHostKeyChecking=no -o ServerAliveInterval=15"

  # Envia o tarball diretamente via SSH + extrai + reinicia
  cat "$TARBALL" | ssh $SSH_OPTS "root@$VPS_HOST" \
    "tar -xzC /opt/petmol/app/apps/web && systemctl restart petmol-web && echo DEPLOY_OK"

  echo "✅ Deploy web concluído."
  echo "   Versão: curl -s $VPS_APP_URL/version.json"
  rm -f "$TARBALL"
}

case "$TARGET" in
  web) deploy_web ;;
  api) deploy_api ;;
  all) deploy_web; deploy_api ;;
  local-web) deploy_local_web ;;
  *) echo "Uso: bash deploy.sh [web|api|all|local-web]"; exit 1 ;;
esac
