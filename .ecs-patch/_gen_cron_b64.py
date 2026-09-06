import base64
from pathlib import Path

script = r"""set -e
mkdir -p /etc/bluearm
docker inspect bluearm-api --format '{{range .Config.Env}}{{println .}}{{end}}' > /tmp/bluearm-api.env
grep -E '^(CHANGE_ALERT_JOB_SECRET|CRM_JOB_SECRET)=' /tmp/bluearm-api.env > /etc/bluearm/cron.env || true
chmod 700 /etc/bluearm
chmod 600 /etc/bluearm/cron.env
cat > /usr/local/bin/bluearm-cron-post << 'EOS'
#!/bin/bash
set -euo pipefail
ENDPOINT="$1"
HEADER_NAME="$2"
ENV_KEY="$3"
if [ -f /etc/bluearm/cron.env ]; then set -a; . /etc/bluearm/cron.env; set +a; fi
if [ -z "${CHANGE_ALERT_JOB_SECRET:-}" ] && [ -n "${CRM_JOB_SECRET:-}" ]; then CHANGE_ALERT_JOB_SECRET="$CRM_JOB_SECRET"; fi
if [ -z "${CRM_JOB_SECRET:-}" ] && [ -n "${CHANGE_ALERT_JOB_SECRET:-}" ]; then CRM_JOB_SECRET="$CHANGE_ALERT_JOB_SECRET"; fi
SECRET="${!ENV_KEY:-}"
if [ -z "${SECRET}" ]; then echo "skip ${ENDPOINT}"; exit 0; fi
CODE=$(curl -sS -o /tmp/bluearm-cron-last.json -w '%{http_code}' -X POST "http://127.0.0.1:8080${ENDPOINT}" -H "${HEADER_NAME}: ${SECRET}")
echo "POST ${ENDPOINT} -> HTTP ${CODE}"
test "${CODE}" = "200" -o "${CODE}" = "204"
EOS
chmod 755 /usr/local/bin/bluearm-cron-post
( crontab -l 2>/dev/null | grep -v '# bluearm-cron' || true
echo '# bluearm-cron BEGIN'
echo '0 * * * * /usr/local/bin/bluearm-cron-post /api/v1/platform/jobs/change-alert-digest X-Change-Alert-Job-Secret CHANGE_ALERT_JOB_SECRET >> /var/log/bluearm-cron.log 2>&1 # bluearm-cron'
echo '10 10 * * * /usr/local/bin/bluearm-cron-post /api/v1/platform/jobs/daily-ops-digest X-Change-Alert-Job-Secret CHANGE_ALERT_JOB_SECRET >> /var/log/bluearm-cron.log 2>&1 # bluearm-cron'
echo '10 10 * * 5 /usr/local/bin/bluearm-cron-post /api/v1/platform/jobs/weekly-bi-digest X-Change-Alert-Job-Secret CHANGE_ALERT_JOB_SECRET >> /var/log/bluearm-cron.log 2>&1 # bluearm-cron'
echo '0 1 1 * * /usr/local/bin/bluearm-cron-post /api/v1/platform/jobs/monthly-bi-digest X-Change-Alert-Job-Secret CHANGE_ALERT_JOB_SECRET >> /var/log/bluearm-cron.log 2>&1 # bluearm-cron'
echo '30 10 * * * /usr/local/bin/bluearm-cron-post /api/v1/crm/jobs/evaluate-alerts X-CRM-Job-Secret CRM_JOB_SECRET >> /var/log/bluearm-cron.log 2>&1 # bluearm-cron'
echo '# bluearm-cron END'
) | crontab -
touch /var/log/bluearm-cron.log
/usr/local/bin/bluearm-cron-post /api/v1/crm/jobs/evaluate-alerts X-CRM-Job-Secret CRM_JOB_SECRET
/usr/local/bin/bluearm-cron-post /api/v1/platform/jobs/change-alert-digest X-Change-Alert-Job-Secret CHANGE_ALERT_JOB_SECRET
crontab -l | grep bluearm-cron
echo ECS_CRON_DONE
"""

Path(__file__).with_name("_cron_b64.txt").write_text(base64.b64encode(script.encode()).decode(), encoding="utf-8")
print(len(script), "bytes")
