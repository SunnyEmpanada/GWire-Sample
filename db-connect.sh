#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/.env" ]]; then
  set -a
  source "${SCRIPT_DIR}/.env"
  set +a
fi

if [[ -z "${POSTGRES_PWD:-}" ]]; then
  echo "Error: POSTGRES_PWD is not set." >&2
  exit 1
fi

DB_HOST="${POSTGRES_HOST:-db.mtqnotrbifudwiawvfpy.supabase.co}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_USER="postgres"
DB_NAME="postgres"

PGPASSWORD="${POSTGRES_PWD}" psql \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}"
