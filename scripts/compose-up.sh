#!/usr/bin/env bash
# Starts the database selected by DB / DB_VERSION and waits for its healthcheck.
# Run the tests afterwards with DB_EXTERNAL=1 so Vitest does not start or stop it again.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$("${ROOT}/scripts/resolve-compose-file.sh")"

echo "Starting ${COMPOSE_FILE} (DB=${DB:-sqlite} DB_VERSION=${DB_VERSION:-default})"
docker compose -f "${COMPOSE_FILE}" up --wait --wait-timeout 300
