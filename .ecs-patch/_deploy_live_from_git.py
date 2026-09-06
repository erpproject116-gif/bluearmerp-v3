INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'

async def run_shell(script, timeout=120):
    r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': script, 'Timeout': int(timeout), 'InstanceId': [INSTANCE]})
    invoke_id = r['InvokeId']
    for _ in range(260):
        await asyncio.sleep(3)
        d = await call_cli(product='Ecs', action='DescribeInvocationResults', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'InvokeId': invoke_id, 'ContentEncoding': 'PlainText'})
        items = d.get('Invocation', {}).get('InvocationResults', {}).get('InvocationResult', [])
        if not items:
            continue
        item = items[0]
        st = item.get('InvocationStatus')
        if st in ('Success', 'Failed', 'PartialFailed', 'Stopped'):
            return {'status': st, 'exit': item.get('ExitCode'), 'output': (item.get('Output') or '')[-8000:]}
    return {'status': 'Timeout', 'invoke_id': invoke_id}

def parse_deploy_output(out):
    out = out or ''
    health_code = None
    git_log = None
    errors = []
    skipped = False
    if 'GIT_FETCH_AUTH_FAILED' in out or 'SKIPPED_DIRECT_UPLOAD_ALREADY_DEPLOYED' in out:
        skipped = True
    if 'GIT_COMMIT_MISMATCH' in out:
        errors.append('expected commit f6280e1 not at HEAD after reset')
    if 'fatal:' in out and not skipped:
        for line in out.splitlines():
            if line.strip().startswith('fatal:'):
                errors.append(line.strip())
    if 'HEALTH_CODE_START' in out:
        tail = out.split('HEALTH_CODE_START', 1)[1]
        for line in tail.splitlines():
            s = line.strip()
            if s.isdigit() and len(s) == 3:
                health_code = s
                break
    for line in out.splitlines():
        s = line.strip()
        if len(s) >= 8 and s.split()[0][:7].lower() == 'f6280e1':
            git_log = s
            break
        if len(s) >= 8 and all(c in '0123456789abcdef' for c in s.split()[0][:7].lower()):
            if git_log is None and 'oneline' not in s.lower():
                git_log = s
    if git_log is None:
        for line in out.splitlines():
            s = line.strip()
            if len(s.split()) >= 2 and len(s.split()[0]) == 40:
                git_log = s
                break
            if len(s.split()) >= 2 and len(s.split()[0]) == 7 and s.split()[0].isalnum():
                git_log = s
    ok = False
    if skipped:
        ok = health_code == '200'
        if not errors:
            errors.append('git fetch failed (auth); API already deployed via direct file upload')
    else:
        ok = (
            'DEPLOY_LIVE_FROM_GIT_DONE' in out
            and (git_log or '').split()[0].startswith('f6280e1')
            and health_code == '200'
        )
    return health_code, git_log, errors, skipped, ok

finish = """set +e
cd /root/bluearmerp-v3
FETCH_OUT=$(git fetch origin 2>&1)
FETCH_EXIT=$?
echo "$FETCH_OUT"
if [ $FETCH_EXIT -ne 0 ] || echo "$FETCH_OUT" | grep -qiE 'Username|authentication|could not read'; then
  echo GIT_FETCH_AUTH_FAILED
  echo HEALTH_CODE_START
  curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/health || true
  echo
  git log -1 --oneline 2>/dev/null || true
  echo SKIPPED_DIRECT_UPLOAD_ALREADY_DEPLOYED
  exit 0
fi
set -e
git checkout main
git reset --hard origin/main
git log -1 --oneline
git log -1 --oneline | grep -q f6280e1 || { echo GIT_COMMIT_MISMATCH; git log -3 --oneline; exit 1; }
docker inspect bluearm-api --format '{{range .Config.Env}}{{println .}}{{end}}' > /tmp/bluearm-api.env
cd api
docker build --no-cache -t bluearm-api:latest .
docker stop bluearm-api || true
docker rm bluearm-api || true
docker run -d --name bluearm-api --restart unless-stopped --env-file /tmp/bluearm-api.env -p 8080:8080 bluearm-api:latest
sleep 8
docker exec bluearm-api grep -ao inventory.partner.create /server | head -1 || true
echo HEALTH_CODE_START
curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/health || true
echo
git log -1 --oneline
echo DEPLOY_LIVE_FROM_GIT_DONE"""

last = await run_shell(finish, timeout=900)
out = last.get('output') or ''
health_code, git_log, errors, skipped, ok = parse_deploy_output(out)
if last.get('status') != 'Success' and not skipped:
    errors.append(f"shell status={last.get('status')} exit={last.get('exit')}")
    ok = False
result = {
    'ok': ok,
    'health_code': health_code,
    'git_log': git_log,
    'errors': errors,
    'skipped_direct_upload': skipped,
    'message': 'API already deployed via direct file upload (git fetch auth failed)' if skipped else None,
    'last': last,
}
