#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
COMPOSE_FILE="${COMPOSE_FILE:-deploy/compose.production.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"

echo "=== Containers ==="
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
echo
echo "=== Health ==="
curl -sS http://127.0.0.1/api/health || true
echo
echo "=== Queue/log summary ==="
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs --tail=30 worker research-worker app
