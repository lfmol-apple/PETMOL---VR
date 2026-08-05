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

# ── Postgres dump ────────────────────────────────────────────────────────────
# In prod, DATABASE_URL always points at Postgres (config.py's validate_prod
# enforces this) — the actual user/pet/vaccine/feeding data lives there, not
# in services/price-service/petmol.db (that file is dev-only SQLite and
# simply won't exist in prod). This backup used to only archive that SQLite
# file plus uploads/.env, so a Postgres-backed prod deploy was silently
# backing up everything except the database.
PG_DUMP_REL_PATH="services/price-service/_backup_db.dump"
PG_DUMP_ABS_PATH="${ROOT_DIR}/${PG_DUMP_REL_PATH}"
BACKEND_ENV_FILE="${ROOT_DIR}/services/price-service/.env"

cleanup_pg_dump() {
  rm -f "${PG_DUMP_ABS_PATH}"
}
trap cleanup_pg_dump EXIT

DID_DUMP_DB=0
if [[ -f "${BACKEND_ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  set -a; source "${BACKEND_ENV_FILE}"; set +a

  if [[ "${DATABASE_URL:-}" == postgresql* ]]; then
    if ! command -v pg_dump >/dev/null 2>&1; then
      echo "ERRO: DATABASE_URL e Postgres mas pg_dump nao esta instalado. Backup abortado — rodar sem o dump do banco seria enganoso." >&2
      exit 1
    fi

    # pg_dump needs a plain postgresql:// URI; SQLAlchemy's +psycopg2 dialect
    # suffix isn't valid libpq syntax.
    PG_DUMP_URL="${DATABASE_URL/postgresql+psycopg2:/postgresql:}"

    echo "Gerando dump do Postgres..."
    if ! pg_dump "${PG_DUMP_URL}" -Fc -f "${PG_DUMP_ABS_PATH}"; then
      echo "ERRO: pg_dump falhou. Backup abortado — melhor falhar alto do que gerar um backup sem banco." >&2
      exit 1
    fi
    DID_DUMP_DB=1
  fi
fi

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

if [[ "${DID_DUMP_DB}" -eq 1 ]]; then
  TARGETS+=("${PG_DUMP_REL_PATH}")
fi

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
if [[ "${DID_DUMP_DB}" -eq 1 ]]; then
  echo "Inclui dump do Postgres (${PG_DUMP_REL_PATH} dentro do arquivo)."
fi
