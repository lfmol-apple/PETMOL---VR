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

# The env file that actually carries DATABASE_URL. The old default —
# ${ROOT_DIR}/services/price-service/.env — is the *price-service* partial
# env and, outside a release dir where it's a symlink to the shared file,
# it has no DATABASE_URL. Resolve it robustly instead:
#   1. PETMOL_API_ENV_FILE, if explicitly set;
#   2. /opt/petmol/shared/env/api.env (production layout — systemd
#      EnvironmentFile; also the symlink target inside a release dir);
#   3. ${ROOT_DIR}/services/price-service/.env (local/dev).
# Never `source` the file (other values aren't valid bash) — only the
# DATABASE_URL line is read, with grep. DATABASE_URL is never echoed.
PROD_API_ENV_FILE="/opt/petmol/shared/env/api.env"
BACKEND_ENV_FILE=""
for _candidate in \
  "${PETMOL_API_ENV_FILE:-}" \
  "${PROD_API_ENV_FILE}" \
  "${ROOT_DIR}/services/price-service/.env"
do
  if [[ -n "${_candidate}" && -f "${_candidate}" ]] && grep -qE '^DATABASE_URL=.+' "${_candidate}"; then
    BACKEND_ENV_FILE="${_candidate}"
    break
  fi
done

# "Production context": running on the VPS layout, or told so explicitly.
IS_PROD=0
if [[ -d "/opt/petmol/shared/env" || -f "${PROD_API_ENV_FILE}" \
      || "${PETMOL_ENV:-${ENV:-}}" == prod* || "${PETMOL_ENV:-${ENV:-}}" == production ]]; then
  IS_PROD=1
fi

cleanup_pg_dump() {
  rm -f "${PG_DUMP_ABS_PATH}"
}
trap cleanup_pg_dump EXIT

DID_DUMP_DB=0
if [[ -n "${BACKEND_ENV_FILE}" ]]; then
  DATABASE_URL="$(grep -m1 '^DATABASE_URL=' "${BACKEND_ENV_FILE}" | cut -d= -f2-)"

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

# Em produção, um backup só de arquivos (sem o dump do Postgres) parece OK,
# termina com exit 0 e NÃO restaura o banco. Falhar alto em vez de aceitar
# sucesso silencioso quando o dump esperado não aconteceu.
if [[ "${IS_PROD}" -eq 1 && "${DID_DUMP_DB}" -ne 1 ]]; then
  echo "ERRO: contexto de producao, mas nao foi possivel resolver um DATABASE_URL" >&2
  echo "      Postgres para o dump (defina PETMOL_API_ENV_FILE ou confira" >&2
  echo "      ${PROD_API_ENV_FILE}). Backup abortado — nao gerar backup sem banco." >&2
  exit 1
fi

# Secrets (.env files) are intentionally NOT in the main data archive —
# that archive is what's meant to leave the VPS (off-site hook below), and
# shipping plaintext JWT/DB/API secrets off-host is a real exposure. They
# get their own, separately-encrypted archive further down instead.
TARGETS=(
  "analysis"
  "uploads"
  "services/price-service/uploads"
  "services/price-service/petmol.db"
  "services/price-service/push_subscriptions.json"
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

# -h dereferences symlinks: services/price-service/uploads is a symlink to
# the shared uploads dir (see deploy/release/activate.sh) so every real
# release archives it that way. Without -h, tar stores the symlink itself
# and every pet photo/document is silently missing from the backup while
# the script still exits 0 — this bit us for real, fixed here for good.
tar -czhf "${ARCHIVE_PATH}" -C "${ROOT_DIR}" "${EXISTING_TARGETS[@]}"
shasum -a 256 "${ARCHIVE_PATH}" > "${CHECKSUM_PATH}"

# ── Secrets, separately and (when a key is configured) encrypted ───────────
SECRETS_TARGETS=(
  ".env"
  "apps/web/.env"
  "functions/.env"
  "services/price-service/.env"
)
EXISTING_SECRETS=()
for target in "${SECRETS_TARGETS[@]}"; do
  if [[ -e "${ROOT_DIR}/${target}" ]]; then
    EXISTING_SECRETS+=("${target}")
  fi
done

SECRETS_ARCHIVE_PATH="${BACKUP_DIR}/${BACKUP_NAME}_secrets.tar.gz"
SECRETS_ENC_PATH="${SECRETS_ARCHIVE_PATH}.enc"
DID_BACKUP_SECRETS=0
if [[ "${#EXISTING_SECRETS[@]}" -gt 0 ]]; then
  if [[ -n "${BACKUP_ENCRYPTION_KEY:-}" ]]; then
    tar -czhf "${SECRETS_ARCHIVE_PATH}" -C "${ROOT_DIR}" "${EXISTING_SECRETS[@]}"
    openssl enc -aes-256-cbc -pbkdf2 -salt -in "${SECRETS_ARCHIVE_PATH}" \
      -out "${SECRETS_ENC_PATH}" -pass env:BACKUP_ENCRYPTION_KEY
    rm -f "${SECRETS_ARCHIVE_PATH}"
    shasum -a 256 "${SECRETS_ENC_PATH}" > "${SECRETS_ENC_PATH}.sha256"
    DID_BACKUP_SECRETS=1
    echo "Secrets: arquivados e criptografados em ${SECRETS_ENC_PATH}."
  else
    echo "AVISO: BACKUP_ENCRYPTION_KEY nao definido — secrets (.env) NAO foram" >&2
    echo "incluidos neste backup. Defina BACKUP_ENCRYPTION_KEY para tambem" >&2
    echo "arquivar .env de forma criptografada, ou gerencie secrets separadamente." >&2
  fi
fi

# ── Off-site copy ────────────────────────────────────────────────────────
# Generic hook instead of hardcoding a provider: set BACKUP_OFFSITE_CMD to
# any command that accepts a file path as its final argument (rclone copy,
# rsync, scp, aws s3 cp, etc). Runs for the main archive, its checksum, and
# the encrypted secrets archive when present. Off by default (empty = skip)
# until a real destination is configured.
if [[ -n "${BACKUP_OFFSITE_CMD:-}" ]]; then
  echo "Copiando off-site via: ${BACKUP_OFFSITE_CMD}"
  ${BACKUP_OFFSITE_CMD} "${ARCHIVE_PATH}"
  ${BACKUP_OFFSITE_CMD} "${CHECKSUM_PATH}"
  if [[ "${DID_BACKUP_SECRETS}" -eq 1 ]]; then
    ${BACKUP_OFFSITE_CMD} "${SECRETS_ENC_PATH}"
    ${BACKUP_OFFSITE_CMD} "${SECRETS_ENC_PATH}.sha256"
  fi
fi

if [[ -n "${MIRROR_DIR}" ]]; then
  mkdir -p "${MIRROR_DIR}"
  cp "${ARCHIVE_PATH}" "${MIRROR_DIR}/"
  cp "${CHECKSUM_PATH}" "${MIRROR_DIR}/"
  if [[ "${DID_BACKUP_SECRETS}" -eq 1 ]]; then
    cp "${SECRETS_ENC_PATH}" "${MIRROR_DIR}/"
    cp "${SECRETS_ENC_PATH}.sha256" "${MIRROR_DIR}/"
  fi
  find "${MIRROR_DIR}" -type f -name "petmol_*.tar.gz" -mtime +"${RETENTION_DAYS}" -delete
  find "${MIRROR_DIR}" -type f -name "petmol_*.sha256" -mtime +"${RETENTION_DAYS}" -delete
  find "${MIRROR_DIR}" -type f -name "petmol_*.enc" -mtime +"${RETENTION_DAYS}" -delete
fi

find "${BACKUP_DIR}" -type f -name "petmol_*.tar.gz" -mtime +"${RETENTION_DAYS}" -delete
find "${BACKUP_DIR}" -type f -name "petmol_*.sha256" -mtime +"${RETENTION_DAYS}" -delete
find "${BACKUP_DIR}" -type f -name "petmol_*.enc" -mtime +"${RETENTION_DAYS}" -delete

echo "Backup concluido: ${ARCHIVE_PATH}"
if [[ "${DID_DUMP_DB}" -eq 1 ]]; then
  echo "Inclui dump do Postgres (${PG_DUMP_REL_PATH} dentro do arquivo)."
fi
