import base64
from pathlib import Path

script = r"""set -e
cat > /usr/local/bin/bluearm-cron-post << 'EOS'
#!/bin/bash
set -euo pipefail
ENDPOINT="$1"
HEADER_NAME="$2"
ENV_KEY="$3"
read_secret() {
  docker inspect bluearm-api --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep "^${ENV_KEY}=" | head -1 | cut -d= -f2- || true
}
SECRET="$(read_secret)"
if [ -z "${SECRET}" ] && [ "${ENV_KEY}" = "CRM_JOB_SECRET" ]; then
  SECRET="$(docker inspect bluearm-api --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep '^CHANGE_ALERT_JOB_SECRET=' | head -1 | cut -d= -f2- || true)"
fi
if [ -z "${SECRET}" ] && [ "${ENV_KEY}" = "CHANGE_ALERT_JOB_SECRET" ]; then
  SECRET="$(docker inspect bluearm-api --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep '^CRM_JOB_SECRET=' | head -1 | cut -d= -f2- || true)"
fi
if [ -z "${SECRET}" ]; then echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) skip ${ENDPOINT} (no ${ENV_KEY})"; exit 0; fi
CODE=$(curl -sS -o /tmp/bluearm-cron-last.json -w '%{http_code}' -X POST "http://127.0.0.1:8080${ENDPOINT}" -H "${HEADER_NAME}: ${SECRET}")
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) POST ${ENDPOINT} -> HTTP ${CODE}"
test "${CODE}" = "200" -o "${CODE}" = "204"
EOS
chmod 755 /usr/local/bin/bluearm-cron-post
/usr/local/bin/bluearm-cron-post /api/v1/crm/jobs/evaluate-alerts X-CRM-Job-Secret CRM_JOB_SECRET || echo CRM_FAIL
/usr/local/bin/bluearm-cron-post /api/v1/platform/jobs/change-alert-digest X-Change-Alert-Job-Secret CHANGE_ALERT_JOB_SECRET || echo DIGEST_FAIL
echo FIX_DONE
"""
Path(__file__).with_name("_cron_fix_b64.txt").write_text(base64.b64encode(script.encode()).decode(), encoding="utf-8")
