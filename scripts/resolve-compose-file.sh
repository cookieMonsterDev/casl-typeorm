#!/usr/bin/env bash
# Prints the compose file for DB / DB_VERSION (COMPOSE_FILE overrides). Exits 2 for sqlite, which
# runs in-process and needs no container. Keep in sync with test/helpers/db.ts.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS="${ROOT}/test/assets"

if [[ -n "${COMPOSE_FILE:-}" ]]; then
  echo "${COMPOSE_FILE}"
  exit 0
fi

DB="${DB:-sqlite}"
DB="$(echo "${DB}" | tr '[:upper:]' '[:lower:]')"

case "${DB}" in
  sqlite)
    echo "DB=sqlite runs in-process; nothing to start." >&2
    exit 2
    ;;
  postgres) VERSION="${DB_VERSION:-17}"; KNOWN="17, 15" ;;
  mysql) VERSION="${DB_VERSION:-9}"; KNOWN="9, 8" ;;
  mssql) VERSION="${DB_VERSION:-2022}"; KNOWN="2022" ;;
  mongodb) VERSION="${DB_VERSION:-8}"; KNOWN="8" ;;
  *)
    echo "Unsupported DB=${DB}. Known databases: sqlite, postgres, mysql, mssql, mongodb" >&2
    exit 1
    ;;
esac

FILE="${ASSETS}/docker-compose.${DB}-${VERSION}.yml"
if [[ ! -f "${FILE}" ]]; then
  echo "Unsupported DB_VERSION=${VERSION} for DB=${DB}. Known versions: ${KNOWN}" >&2
  exit 1
fi

echo "${FILE}"
