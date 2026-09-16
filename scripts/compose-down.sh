#!/usr/bin/env bash
# Stops the database selected by DB / DB_VERSION and removes its volumes.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$("${ROOT}/scripts/resolve-compose-file.sh")"

docker compose -f "${COMPOSE_FILE}" down --remove-orphans --volumes
