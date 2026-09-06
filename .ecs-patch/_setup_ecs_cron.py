INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'

async def run_shell(script, timeout=180):
    r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': script, 'Timeout': int(timeout), 'InstanceId': [INSTANCE]})
    invoke_id = r['InvokeId']
    for _ in range(120):
        await asyncio.sleep(3)
        d = await call_cli(product='Ecs', action='DescribeInvocationResults', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'InvokeId': invoke_id, 'ContentEncoding': 'PlainText'})
        items = d.get('Invocation', {}).get('InvocationResults', {}).get('InvocationResult', [])
        if not items:
            continue
        item = items[0]
        st = item.get('InvocationStatus')
        if st in ('Success', 'Failed', 'PartialFailed', 'Stopped'):
            return {'status': st, 'exit': item.get('ExitCode'), 'output': (item.get('output') or item.get('Output') or '')[-20000:]}
    return {'status': 'Timeout', 'invoke_id': invoke_id}

setup = r'''set -e
if ! command -v crontab >/dev/null 2>&1; then
  if command -v yum >/dev/null 2>&1; then yum install -y cronie || true
  elif command -v apt-get >/dev/null 2>&1; then apt-get update && apt-get install -y cron || true
  fi
fi
systemctl enable crond 2>/dev/null || systemctl enable cron 2>/dev/null || true
systemctl start crond 2>/dev/null || systemctl start cron 2>/dev/null || true
mkdir -p /etc/bluearm
docker inspect bluearm-api --format '{{range .Config.Env}}{{println .}}{{end}}' > /tmp/bluearm-api.env
grep -E '^(CHANGE_ALERT_JOB_SECRET|CRM_JOB_SECRET|PLATFORM_JOB_SECRET)=' /tmp/bluearm-api.env > /etc/bluearm/cron.env || true
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
if [ -z "${SECRET}" ]; then echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) skip ${ENDPOINT} (no ${ENV_KEY})"; exit 0; fi
CODE=$(curl -sS -o /tmp/bluearm-cron-last.json -w '%{http_code}' -X POST "http://127.0.0.1:8080${ENDPOINT}" -H "${HEADER_NAME}: ${SECRET}" -H 'Content-Type: application/json')
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) POST ${ENDPOINT} -> HTTP ${CODE}"
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
chmod 644 /var/log/bluearm-cron.log
/usr/local/bin/bluearm-cron-post /api/v1/crm/jobs/evaluate-alerts X-CRM-Job-Secret CRM_JOB_SECRET || echo CRM_SMOKE_FAILED
/usr/local/bin/bluearm-cron-post /api/v1/platform/jobs/change-alert-digest X-Change-Alert-Job-Secret CHANGE_ALERT_JOB_SECRET || echo DIGEST_SMOKE_FAILED
echo CRON_LIST_START
crontab -l | grep bluearm-cron || true
echo CRON_LIST_END
echo SECRET_KEYS_START
cut -d= -f1 /etc/bluearm/cron.env 2>/dev/null | tr '\n' ' ' || true
echo
echo SECRET_KEYS_END
echo ECS_CRON_SETUP_DONE
'''

last = await run_shell(setup, timeout=300)
out = last.get('output') or ''
ok = last.get('status') == 'Success' and 'ECS_CRON_SETUP_DONE' in out and 'CRM_SMOKE_FAILED' not in out and 'DIGEST_SMOKE_FAILED' not in out
cron_lines = []
if 'CRON_LIST_START' in out:
    cron_lines = out.split('CRON_LIST_START', 1)[1].split('CRON_LIST_END', 1)[0].strip().splitlines()
secret_keys = ''
if 'SECRET_KEYS_START' in out:
    secret_keys = out.split('SECRET_KEYS_START', 1)[1].split('SECRET_KEYS_END', 1)[0].strip()
result = {'ok': ok, 'invoke_status': last.get('status'), 'exit': last.get('exit'), 'cron_lines': cron_lines, 'secret_keys_present': secret_keys, 'tail': out[-4000:]}
