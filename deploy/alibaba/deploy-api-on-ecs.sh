#!/usr/bin/env bash
# Deploy Go API on bluearm-api ECS (git pull + docker rebuild).
# Invoked by GitHub Actions via Alibaba ECS RunCommand, or manually on the VM.
#
# Usage:
#   deploy-api-on-ecs.sh [COMMIT_SHA] [GITHUB_TOKEN] [CONTAINER_NAME]
#
# COMMIT_SHA     — optional; when set, fetch that commit (it need not be on main).
#                  When omitted, reset to origin/main.
# GITHUB_TOKEN   — optional PAT for private repo fetch (x-access-token)
# CONTAINER_NAME — optional; defaults to bluearm-api. Production omits this argument.

set -euo pipefail

REPO_DIR="${REPO_DIR:-/root/bluearmerp-v3}"
DEPLOY_SHA="${1:-}"
GIT_TOKEN="${2:-}"
CONTAINER_NAME="${3:-${CONTAINER_NAME:-bluearm-api}}"
ENV_FILE="/tmp/${CONTAINER_NAME}.env"
ENV_BAK="/tmp/${CONTAINER_NAME}.env.bak"
IMAGE_NAME="${CONTAINER_NAME}:latest"
ROLLBACK_IMAGE="${CONTAINER_NAME}:rollback"
CANDIDATE_NAME="${CONTAINER_NAME}-candidate"
CANDIDATE_PORT="${CANDIDATE_PORT:-18081}"
HEALTH_URL="http://127.0.0.1:8080/health"
SCHEMA_URL="http://127.0.0.1:8080/health/schema"
CANDIDATE_HEALTH_URL="http://127.0.0.1:${CANDIDATE_PORT}/health"
CADDY_CONFIG="${CADDY_CONFIG:-/etc/caddy/Caddyfile}"
CADDY_BACKUP="/tmp/${CONTAINER_NAME}.Caddyfile.bak"
CADDY_CANDIDATE="/tmp/${CONTAINER_NAME}.Caddyfile.candidate"

cd "$REPO_DIR"

if [ -n "$GIT_TOKEN" ]; then
  git remote set-url origin "https://x-access-token:${GIT_TOKEN}@github.com/erpproject116-gif/bluearmerp-v3.git"
fi

if [ -n "$DEPLOY_SHA" ]; then
  git fetch origin "$DEPLOY_SHA"
  git reset --hard "$DEPLOY_SHA"
else
  git fetch origin main
  git reset --hard origin/main
fi
git log -1 --oneline

docker inspect "$CONTAINER_NAME" --format '{{range .Config.Env}}{{println .}}{{end}}' > "$ENV_FILE"
# Keep a durable copy so a failed stop/rm/run cycle cannot wipe secrets.
if [ -s "$ENV_FILE" ] && grep -q '^DATABASE_URL=' "$ENV_FILE" && grep -q '^SUPABASE_URL=' "$ENV_FILE"; then
  cp -f "$ENV_FILE" "$ENV_BAK"
elif [ -f "$ENV_BAK" ] && grep -q '^DATABASE_URL=' "$ENV_BAK"; then
  cp -f "$ENV_BAK" "$ENV_FILE"
fi

# Preserve the exact running image so a failed final cutover can restore it.
OLD_IMAGE_ID="$(docker inspect "$CONTAINER_NAME" --format '{{.Image}}')"
docker tag "$OLD_IMAGE_ID" "$ROLLBACK_IMAGE"

cd api
docker build -t "$IMAGE_NAME" .

# Warm and validate the new image without touching the live container.
docker rm -f "$CANDIDATE_NAME" 2>/dev/null || true
docker run -d \
  --name "$CANDIDATE_NAME" \
  --restart unless-stopped \
  --env-file "$ENV_FILE" \
  -p "127.0.0.1:${CANDIDATE_PORT}:8080" \
  "$IMAGE_NAME"

candidate_code="000"
for _ in $(seq 1 30); do
  candidate_code="$(curl -sS -o /dev/null -w '%{http_code}' "$CANDIDATE_HEALTH_URL" 2>/dev/null || echo 000)"
  if [ "$candidate_code" = "200" ]; then
    break
  fi
  sleep 2
done
echo "CANDIDATE_HEALTH_CODE=$candidate_code"
if [ "$candidate_code" != "200" ]; then
  docker logs "$CANDIDATE_NAME" --tail 80 2>&1 || true
  docker rm -f "$CANDIDATE_NAME" 2>/dev/null || true
  echo "Candidate failed health; live container was not touched."
  exit 1
fi

# If Caddy is file-managed, route public traffic to the healthy candidate while
# replacing :8080. This removes the stop/start 502 window. Otherwise the warm
# candidate still reduces cutover to only a fast container swap.
caddy_cutover="false"
if command -v caddy >/dev/null 2>&1 &&
   [ -r "$CADDY_CONFIG" ] &&
   grep -q '127\.0\.0\.1:8080' "$CADDY_CONFIG"; then
  cp -f "$CADDY_CONFIG" "$CADDY_BACKUP"
  sed "s#127\\.0\\.0\\.1:8080#127.0.0.1:${CANDIDATE_PORT}#g" "$CADDY_CONFIG" > "$CADDY_CANDIDATE"
  caddy validate --config "$CADDY_CANDIDATE" --adapter caddyfile
  cp -f "$CADDY_CANDIDATE" "$CADDY_CONFIG"
  if caddy reload --config "$CADDY_CONFIG" --adapter caddyfile; then
    caddy_cutover="true"
    sleep 1
  else
    cp -f "$CADDY_BACKUP" "$CADDY_CONFIG"
    caddy reload --config "$CADDY_CONFIG" --adapter caddyfile || true
    docker rm -f "$CANDIDATE_NAME" 2>/dev/null || true
    echo "Caddy candidate cutover failed; live container was not touched."
    exit 1
  fi
fi

docker stop "$CONTAINER_NAME" 2>/dev/null || true
docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  --env-file "$ENV_FILE" \
  -p 8080:8080 \
  "$IMAGE_NAME"

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
  docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
  docker run -d \
    --name "$CONTAINER_NAME" \
    --restart unless-stopped \
    --env-file "$ENV_FILE" \
    -p 8080:8080 \
    "$ROLLBACK_IMAGE"
  rollback_code="000"
  for _ in $(seq 1 30); do
    rollback_code="$(curl -sS -o /dev/null -w '%{http_code}' "$HEALTH_URL" 2>/dev/null || echo 000)"
    if [ "$rollback_code" = "200" ]; then
      break
    fi
    sleep 2
  done
  echo "ROLLBACK_HEALTH_CODE=$rollback_code"
  if [ "$rollback_code" = "200" ] && [ "$caddy_cutover" = "true" ]; then
    cp -f "$CADDY_BACKUP" "$CADDY_CONFIG"
    caddy reload --config "$CADDY_CONFIG" --adapter caddyfile || true
    docker rm -f "$CANDIDATE_NAME" 2>/dev/null || true
  fi
  echo "Final container failed health; restored prior image where possible."
  exit 1
fi

if [ "$caddy_cutover" = "true" ]; then
  cp -f "$CADDY_BACKUP" "$CADDY_CONFIG"
  if ! caddy reload --config "$CADDY_CONFIG" --adapter caddyfile; then
    cp -f "$CADDY_CANDIDATE" "$CADDY_CONFIG"
    caddy reload --config "$CADDY_CONFIG" --adapter caddyfile || true
    echo "Caddy final cutover failed; traffic remains on healthy candidate."
    exit 1
  fi
fi

docker rm -f "$CANDIDATE_NAME" 2>/dev/null || true
echo "DEPLOY_DONE"
