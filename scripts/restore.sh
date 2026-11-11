#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <database.dump> <data.tar.gz>" >&2
  exit 1
fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
COMPOSE_FILE="${COMPOSE_FILE:-deploy/compose.production.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"
DB_DUMP="$1"
DATA_ARCHIVE="$2"

if [[ ! -f "$DB_DUMP" || ! -f "$DATA_ARCHIVE" ]]; then
  echo "Backup file not found." >&2
  exit 1
fi

read -r -p "This replaces the current database and uploaded files. Type RESTORE to continue: " answer
[[ "$answer" == "RESTORE" ]] || { echo "Cancelled."; exit 1; }

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" stop app worker
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
  pg_restore -U research -d research --clean --if-exists < "$DB_DUMP"
VOLUME_NAME="$(docker volume ls --format '{{.Name}}' | grep -E 'research_appdata$' | head -1)"
if [[ -z "$VOLUME_NAME" ]]; then
  echo "Could not find the research_appdata Docker volume." >&2
  exit 1
fi
docker run --rm -i -v "$VOLUME_NAME:/data" alpine:3.22 \
  sh -c 'rm -rf /data/* && tar -C /data -xzf -' < "$DATA_ARCHIVE"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d app worker
echo "Restore complete."
