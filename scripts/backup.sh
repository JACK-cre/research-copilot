#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
COMPOSE_FILE="${COMPOSE_FILE:-deploy/compose.production.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

echo "Backing up PostgreSQL..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
  pg_dump -U research -d research -Fc > "$BACKUP_DIR/research-$STAMP.dump"

echo "Backing up application files..."
VOLUME_NAME="$(docker volume ls --format '{{.Name}}' | grep -E 'research_appdata$' | head -1)"
if [[ -z "$VOLUME_NAME" ]]; then
  echo "Could not find the research_appdata Docker volume." >&2
  exit 1
fi
docker run --rm \
  -v "$VOLUME_NAME:/data:ro" \
  alpine:3.22 tar -C /data -czf - . > "$BACKUP_DIR/data-$STAMP.tar.gz"

echo "Backing up environment configuration (contains secrets)..."
cp "$ENV_FILE" "$BACKUP_DIR/env-$STAMP.backup"
chmod 600 "$BACKUP_DIR/env-$STAMP.backup"

find "$BACKUP_DIR" -type f -mtime "+$RETENTION_DAYS" -delete
echo "Backup complete: $BACKUP_DIR/research-$STAMP.dump and data-$STAMP.tar.gz"
