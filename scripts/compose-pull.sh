#!/usr/bin/env bash
# Pulls the image for DB / DB_VERSION; CI uses it to warm the Docker image cache.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$("${ROOT}/scripts/resolve-compose-file.sh")"

docker compose -f "${COMPOSE_FILE}" pull
