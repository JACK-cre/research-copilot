#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

IMAGE="${APP_IMAGE:-ghcr.io/jack-cre/research-copilot:latest}"
TAG="${IMAGE_TAG:-image-latest}"
REPO="${GITHUB_REPO:-JACK-cre/research-copilot}"
FILE="${IMAGE_TAR:-/tmp/research-copilot.tar.gz}"
COMPOSE_FILE="${COMPOSE_FILE:-deploy/compose.production.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"

URLS=(
  "https://gh-proxy.com/https://github.com/${REPO}/releases/download/${TAG}/research-copilot.tar.gz"
  "https://ghfast.top/https://github.com/${REPO}/releases/download/${TAG}/research-copilot.tar.gz"
  "https://github.com/${REPO}/releases/download/${TAG}/research-copilot.tar.gz"
)

if [[ "${SKIP_GIT_PULL:-0}" != "1" ]]; then
  GIT_HTTP_LOW_SPEED_LIMIT=1000 GIT_HTTP_LOW_SPEED_TIME=20 git pull --ff-only
fi

echo "Downloading prebuilt image (this should take 1-3 minutes, not a local next build)..."
downloaded=0
for url in "${URLS[@]}"; do
  echo "Trying $url"
  if curl -fL --connect-timeout 20 --retry 2 --retry-delay 2 -o "$FILE" "$url"; then
    downloaded=1
    break
  fi
done

if [[ "$downloaded" != "1" ]]; then
  echo "Release download failed, trying GHCR pull..."
  docker pull "$IMAGE"
else
  docker load -i "$FILE"
  rm -f "$FILE"
fi

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --no-deps --pull never --no-build app
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
curl -sS http://127.0.0.1/api/health || true
echo
