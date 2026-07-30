#!/bin/bash
# Deploy completo: sincroniza src local → VPS e rebuilda
# Uso: bash deploy.sh [web|api|all|local-web]  (padrão: web)
#   local-web: build local + upload GitHub release + instrução curl para VPS
#              (fallback quando SSH está indisponível)
set -e

TARGET=${1:-web}
VPS_HOST="147.93.33.24"
VPS_USER="root"
SSH_KEY="$HOME/.ssh/id_ed25519"
VPS_SERVICE="petmol-web"
VPS_APP_URL="https://www.petmol.com.br"
DEPLOY_TOKEN="671d19c2fd603495066789d8300031fa94d28016a6f16b96"

# Tenta porta 2222 (pós-hardening) primeiro, cai para 22 se não funcionar
SSH_PORT=22
if ssh -i "$SSH_KEY" -p 2222 -o ConnectTimeout=5 -o BatchMode=yes "$VPS_USER@$VPS_HOST" "exit" 2>/dev/null; then
  SSH_PORT=2222
fi

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

# Quando SSH conectar pela 1ª vez, hardening automático (porta 22 → 2222)
# Idempotente: só age se a porta ainda for 22
harden_ssh_if_needed() {
  if [ "$SSH_PORT" -eq 22 ]; then
    echo "🔒 Aplicando hardening SSH (porta 22 → 2222)..."
    ssh -i "$SSH_KEY" -p 22 -o ConnectTimeout=15 -o BatchMode=yes "$VPS" bash <<'REMOTE'
# Só executa se Port ainda for 22
if ! grep -q '^Port 2222' /etc/ssh/sshd_config; then
  # Remove Port existente, adiciona as configs corretas
  sed -i 's/^#*Port .*//' /etc/ssh/sshd_config
  sed -i 's/^#*UseDNS .*//' /etc/ssh/sshd_config
  sed -i 's/^#*MaxStartups .*//' /etc/ssh/sshd_config

  cat >> /etc/ssh/sshd_config <<EOF

# PETMOL hardening — adicionado automaticamente
Port 2222
UseDNS no
MaxStartups 50:30:100
EOF

  # Abre porta 2222 no firewall ANTES de reiniciar SSH
  ufw allow 2222/tcp comment "SSH hardened"
  ufw delete allow 22/tcp 2>/dev/null || true
  ufw delete allow OpenSSH 2>/dev/null || true

  # Reinicia SSH — a sessão atual (porta 22) se mantém até fechar
  systemctl restart ssh
  echo "✅ SSH hardening aplicado. Próximos deploys usarão porta 2222."
else
  echo "ℹ️  SSH já está na porta 2222."
fi
REMOTE
    SSH_PORT=2222
    echo "✅ SSH hardening concluído. Deploys futuros usarão porta 2222."
  fi
}

deploy_web() {
  echo "🔄 Sincronizando arquivos web..."
  TS=$(date -u +%s)
  echo "{\"v\":\"$TS\"}" > "$APP_LOCAL/apps/web/public/version.json"

  # Garante conectividade com retry
  ssh_retry "$VPS" "exit"

  # Aplica hardening SSH se ainda estiver na porta 22
  harden_ssh_if_needed

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
  harden_ssh_if_needed
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
