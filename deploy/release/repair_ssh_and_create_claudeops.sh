#!/usr/bin/env bash
set -euo pipefail

# Run from the Hostinger Web Console as root when SSH accepts TCP but does not
# send a banner. It repairs sshd/socket activation, clears active fail2ban SSH
# bans, keeps the firewall enabled, and creates a dedicated automation user.

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this script as root." >&2
  exit 1
fi

CLAUDE_USER="${CLAUDE_USER:-claudeops}"
CLAUDE_AUTHORIZED_KEY="${CLAUDE_AUTHORIZED_KEY:-ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIP1Ukpp4QrTmFtBW7i2EGiKIqkTYpKAiOOuMH/GIvxlm Mac backup}"
SSHD_DROPIN="/etc/ssh/sshd_config.d/99-petmol-ssh-access.conf"
SSHD_AUTH_DROPIN="/etc/ssh/sshd_config.d/40-petmol-auth.conf"

log() {
  printf '\n==> %s\n' "$*"
}

log "Snapshot before changes"
hostnamectl || true
date -u || true
systemctl status ssh.socket --no-pager || true
systemctl status ssh --no-pager || true
journalctl -u ssh.socket -u ssh -n 120 --no-pager || true
ss -ltnp | grep -E ':(22|2222)\b' || true

log "Clear active fail2ban bans for sshd, if fail2ban is installed"
if command -v fail2ban-client >/dev/null 2>&1; then
  fail2ban-client status || true
  fail2ban-client status sshd || true
  fail2ban-client unban --all || true
else
  echo "fail2ban-client not installed"
fi

log "Keep UFW enabled, but ensure SSH ports are allowed"
if command -v ufw >/dev/null 2>&1; then
  ufw status verbose || true
  ufw allow 22/tcp comment 'PETMOL SSH primary'
  ufw allow 2222/tcp comment 'PETMOL SSH fallback'
  ufw status verbose || true
else
  echo "ufw not installed"
fi

log "Create or update dedicated automation user: ${CLAUDE_USER}"
if ! id -u "${CLAUDE_USER}" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "${CLAUDE_USER}"
fi
usermod -aG sudo "${CLAUDE_USER}"

install -d -m 700 -o "${CLAUDE_USER}" -g "${CLAUDE_USER}" "/home/${CLAUDE_USER}/.ssh"
touch "/home/${CLAUDE_USER}/.ssh/authorized_keys"
chown "${CLAUDE_USER}:${CLAUDE_USER}" "/home/${CLAUDE_USER}/.ssh/authorized_keys"
chmod 600 "/home/${CLAUDE_USER}/.ssh/authorized_keys"
if ! grep -qxF "${CLAUDE_AUTHORIZED_KEY}" "/home/${CLAUDE_USER}/.ssh/authorized_keys"; then
  printf '%s\n' "${CLAUDE_AUTHORIZED_KEY}" >>"/home/${CLAUDE_USER}/.ssh/authorized_keys"
fi

cat >"/etc/sudoers.d/90-${CLAUDE_USER}" <<EOF
${CLAUDE_USER} ALL=(ALL) NOPASSWD:ALL
EOF
chmod 440 "/etc/sudoers.d/90-${CLAUDE_USER}"
visudo -cf "/etc/sudoers.d/90-${CLAUDE_USER}"

log "Configure ssh.service to listen directly on 22 and 2222"
install -d /etc/ssh/sshd_config.d
rm -f /etc/ssh/sshd_config.d/99-petmol-ports.conf
grep -Eq '^[[:space:]]*Port[[:space:]]+22\b' /etc/ssh/sshd_config || printf '\nPort 22\n' >>/etc/ssh/sshd_config
grep -Eq '^[[:space:]]*Port[[:space:]]+2222\b' /etc/ssh/sshd_config || printf '\nPort 2222\n' >>/etc/ssh/sshd_config
cat >"${SSHD_AUTH_DROPIN}" <<'EOF'
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
if [ -f /etc/ssh/sshd_config.d/50-cloud-init.conf ]; then
  sed -i -E 's/^[[:space:]]*PasswordAuthentication[[:space:]]+.*/PasswordAuthentication no/' /etc/ssh/sshd_config.d/50-cloud-init.conf
fi

cat >"${SSHD_DROPIN}" <<'EOF'
UsePAM yes
MaxStartups 100:30:200
LoginGraceTime 60
ClientAliveInterval 60
ClientAliveCountMax 3
EOF

sshd -t
systemctl daemon-reload
systemctl disable --now ssh.socket || true
systemctl enable ssh
systemctl restart ssh

log "Snapshot after changes"
systemctl is-enabled ssh.socket || true
systemctl is-active ssh.socket || true
systemctl status ssh --no-pager || true
ss -ltnp | grep -E ':(22|2222)\b'
sshd -T | grep -E '^(port|permitrootlogin|pubkeyauthentication|passwordauthentication|kbdinteractiveauthentication|maxstartups|logingracetime) ' || true

log "Done. Test externally:"
echo "ssh -o BatchMode=yes -o ConnectTimeout=15 root@147.93.33.24 'hostname; whoami; date -u'"
echo "ssh -p 2222 -o BatchMode=yes -o ConnectTimeout=15 root@147.93.33.24 'hostname; whoami; date -u'"
echo "ssh -p 2222 -o BatchMode=yes -o ConnectTimeout=15 ${CLAUDE_USER}@147.93.33.24 'sudo -n true && hostname; whoami; date -u'"
