#!/usr/bin/env bash
set -euo pipefail
URL="${HEALTH_URL:-http://127.0.0.1/api/health}"
response="$(curl -fsS --max-time 10 "$URL")"
echo "$response"
if echo "$response" | grep -q '"degraded":true'; then
  echo "Health endpoint reported degraded workers." >&2
  exit 2
fi
