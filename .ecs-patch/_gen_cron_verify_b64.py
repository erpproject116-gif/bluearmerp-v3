import base64
from pathlib import Path

script = """crontab -l 2>/dev/null | grep bluearm-cron || echo NO_CRON
test -x /usr/local/bin/bluearm-cron-post && echo HELPER_OK || echo HELPER_MISSING
if [ -f /etc/bluearm/cron.env ]; then cut -d= -f1 /etc/bluearm/cron.env; else echo NO_CRON_ENV; fi
docker inspect bluearm-api --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E '^(CHANGE_ALERT_JOB_SECRET|CRM_JOB_SECRET)=' | cut -d= -f1 || true
echo VERIFY_DONE
"""
Path(__file__).with_name("_cron_verify_b64.txt").write_text(base64.b64encode(script.encode()).decode(), encoding="utf-8")
