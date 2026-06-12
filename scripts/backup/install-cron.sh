#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

CRON_SCHEDULE="${CRON_SCHEDULE:-15 */6 * * *}"
BACKUP_DIR="${BACKUP_DIR:-${HOME}/.petmol-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
BACKUP_SCRIPT="${ROOT_DIR}/scripts/backup/create-backup.sh"
LOG_DIR="${BACKUP_DIR}"
LOG_FILE="${LOG_DIR}/backup.log"
CRON_MARKER="# petmol-backup-job"
CRON_CMD="BACKUP_DIR=\"${BACKUP_DIR}\" RETENTION_DAYS=\"${RETENTION_DAYS}\" \"${BACKUP_SCRIPT}\" >> \"${LOG_FILE}\" 2>&1 ${CRON_MARKER}"

if [[ ! -x "${BACKUP_SCRIPT}" ]]; then
  echo "Script de backup nao executavel: ${BACKUP_SCRIPT}"
  echo "Rode: chmod +x scripts/backup/create-backup.sh"
  exit 1
fi

mkdir -p "${LOG_DIR}"

TMP_CRON="$(mktemp)"
crontab -l 2>/dev/null | grep -v "${CRON_MARKER}" > "${TMP_CRON}" || true
printf "%s %s\n" "${CRON_SCHEDULE}" "${CRON_CMD}" >> "${TMP_CRON}"
crontab "${TMP_CRON}"
rm -f "${TMP_CRON}"

echo "Agendamento instalado com sucesso."
echo "Agenda: ${CRON_SCHEDULE}"
echo "Log: ${LOG_FILE}"
