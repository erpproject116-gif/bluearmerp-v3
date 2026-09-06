INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'

async def run_shell(script, timeout=120):
    r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': script, 'Timeout': int(timeout), 'InstanceId': [INSTANCE]})
    invoke_id = r['InvokeId']
    for _ in range(300):
        await asyncio.sleep(3)
        d = await call_cli(product='Ecs', action='DescribeInvocationResults', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'InvokeId': invoke_id, 'ContentEncoding': 'PlainText'})
        items = d.get('Invocation', {}).get('InvocationResults', {}).get('InvocationResult', [])
        if not items:
            continue
        item = items[0]
        st = item.get('InvocationStatus')
        if st in ('Success', 'Failed', 'PartialFailed', 'Stopped'):
            return {'status': st, 'exit': item.get('ExitCode'), 'output': (item.get('output') or item.get('Output') or '')[-12000:]}
    return {'status': 'Timeout', 'invoke_id': invoke_id}

phases = [
"""set -e
cd /root/bluearmerp-v3
grep -n parseBomTypeListFilter api/internal/modules/manufacturing/boms.go | head -1
grep -n buildMaterialNeeds api/internal/modules/manufacturing/work_orders.go | head -1
docker inspect bluearm-api --format '{{range .Config.Env}}{{println .}}{{end}}' > /tmp/bluearm-api.env
cd api
docker build --no-cache -t bluearm-api:latest .
docker stop bluearm-api || true
docker rm bluearm-api || true
docker run -d --name bluearm-api --restart unless-stopped --env-file /tmp/bluearm-api.env -p 8080:8080 bluearm-api:latest
sleep 10
echo HEALTH_CODE_START
curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/health || true
echo
echo DEPLOY_PRODUCTION_SPLIT_API_DONE"""
]
outputs = []
for phase in phases:
    last = await run_shell(phase, timeout=900)
    outputs.append(last)
    if last.get('status') != 'Success':
        result = {'ok': False, 'outputs': outputs, 'last': last}
        break
else:
    out = (outputs[-1].get('output') or '')
    health_code = None
    if 'HEALTH_CODE_START' in out:
        tail = out.split('HEALTH_CODE_START', 1)[1].strip().splitlines()
        if tail:
            health_code = tail[0].strip()
    result = {'ok': 'DEPLOY_PRODUCTION_SPLIT_API_DONE' in out and health_code == '200', 'health_code': health_code, 'outputs': outputs, 'last': outputs[-1]}
