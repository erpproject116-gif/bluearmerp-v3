#!/usr/bin/env bash
# Deploy Go API on bluearm-api ECS (git pull + docker rebuild).
# Invoked by GitHub Actions via Alibaba ECS RunCommand, or manually on the VM.
#
# Usage:
#   deploy-api-on-ecs.sh [COMMIT_SHA] [GITHUB_TOKEN]
#
# COMMIT_SHA  — optional; defaults to origin/main after fetch
# GITHUB_TOKEN — optional PAT for private repo fetch (x-access-token)

set -euo pipefail

REPO_DIR="${REPO_DIR:-/root/bluearmerp-v3}"
DEPLOY_SHA="${1:-}"
GIT_TOKEN="${2:-}"
CONTAINER_NAME="${CONTAINER_NAME:-bluearm-api}"
ENV_FILE="/tmp/bluearm-api.env"
HEALTH_URL="http://127.0.0.1:8080/health"
SCHEMA_URL="http://127.0.0.1:8080/health/schema"

cd "$REPO_DIR"

if [ -n "$GIT_TOKEN" ]; then
  git remote set-url origin "https://x-access-token:${GIT_TOKEN}@github.com/erpproject116-gif/bluearmerp-v3.git"
fi

git fetch origin main
if [ -n "$DEPLOY_SHA" ]; then
  git reset --hard "$DEPLOY_SHA"
else
  git reset --hard origin/main
fi
git log -1 --oneline

docker inspect "$CONTAINER_NAME" --format '{{range .Config.Env}}{{println .}}{{end}}' > "$ENV_FILE"
# Keep a durable copy so a failed stop/rm/run cycle cannot wipe secrets.
if [ -s "$ENV_FILE" ] && grep -q '^DATABASE_URL=' "$ENV_FILE" && grep -q '^SUPABASE_URL=' "$ENV_FILE"; then
  cp -f "$ENV_FILE" /tmp/bluearm-api.env.bak
elif [ -f /tmp/bluearm-api.env.bak ] && grep -q '^DATABASE_URL=' /tmp/bluearm-api.env.bak; then
  cp -f /tmp/bluearm-api.env.bak "$ENV_FILE"
fi

cd api
docker build -t bluearm-api:latest .
docker stop "$CONTAINER_NAME" 2>/dev/null || true
docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  --env-file "$ENV_FILE" \
  -p 8080:8080 \
  bluearm-api:latest

health_code="000"
for _ in $(seq 1 30); do
  health_code="$(curl -sS -o /dev/null -w '%{http_code}' "$HEALTH_URL" 2>/dev/null || echo 000)"
  if [ "$health_code" = "200" ]; then
    break
  fi
  sleep 2
done

echo "HEALTH_CODE=$health_code"
curl -sf "$SCHEMA_URL" || true
echo

if [ "$health_code" != "200" ]; then
  docker logs "$CONTAINER_NAME" --tail 80 2>&1 || true
  exit 1
fi

echo "DEPLOY_DONE"
