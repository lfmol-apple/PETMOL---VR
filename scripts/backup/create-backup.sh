#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
HOSTNAME_SHORT="$(hostname -s 2>/dev/null || hostname)"
BACKUP_NAME="petmol_${HOSTNAME_SHORT}_${TIMESTAMP}"

BACKUP_DIR="${BACKUP_DIR:-${HOME}/.petmol-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
MIRROR_DIR="${BACKUP_MIRROR_DIR:-}"

mkdir -p "${BACKUP_DIR}"

ARCHIVE_PATH="${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
CHECKSUM_PATH="${BACKUP_DIR}/${BACKUP_NAME}.sha256"

TARGETS=(
  "analysis"
  "uploads"
  "services/price-service/uploads"
  "services/price-service/petmol.db"
  "services/price-service/push_subscriptions.json"
  ".env"
  "apps/web/.env"
  "functions/.env"
  "services/price-service/.env"
)

EXISTING_TARGETS=()
for target in "${TARGETS[@]}"; do
  if [[ -e "${ROOT_DIR}/${target}" ]]; then
    EXISTING_TARGETS+=("${target}")
  fi
done

if [[ "${#EXISTING_TARGETS[@]}" -eq 0 ]]; then
  echo "Nenhum alvo de backup encontrado. Revise TARGETS em ${BASH_SOURCE[0]}."
  exit 1
fi

echo "Iniciando backup: ${BACKUP_NAME}"
echo "Diretorio: ${BACKUP_DIR}"
echo "Itens: ${EXISTING_TARGETS[*]}"

tar -czf "${ARCHIVE_PATH}" -C "${ROOT_DIR}" "${EXISTING_TARGETS[@]}"
shasum -a 256 "${ARCHIVE_PATH}" > "${CHECKSUM_PATH}"

if [[ -n "${MIRROR_DIR}" ]]; then
  mkdir -p "${MIRROR_DIR}"
  cp "${ARCHIVE_PATH}" "${MIRROR_DIR}/"
  cp "${CHECKSUM_PATH}" "${MIRROR_DIR}/"
  find "${MIRROR_DIR}" -type f -name "petmol_*.tar.gz" -mtime +"${RETENTION_DAYS}" -delete
  find "${MIRROR_DIR}" -type f -name "petmol_*.sha256" -mtime +"${RETENTION_DAYS}" -delete
fi

find "${BACKUP_DIR}" -type f -name "petmol_*.tar.gz" -mtime +"${RETENTION_DAYS}" -delete
find "${BACKUP_DIR}" -type f -name "petmol_*.sha256" -mtime +"${RETENTION_DAYS}" -delete

echo "Backup concluido: ${ARCHIVE_PATH}"
