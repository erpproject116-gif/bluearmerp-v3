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
            return {'status': st, 'output': (item.get('output') or item.get('Output') or '')[-12000:]}
    return {'status': 'Timeout'}
phase = '''set -e
cd /root/bluearmerp-v3
grep -n reports/work-order-status api/internal/modules/manufacturing/routes.go
grep -n listOpenSalesOrderLinesForWO api/internal/modules/manufacturing/wo_so_link.go | head -1
docker inspect bluearm-api --format '{{range .Config.Env}}{{println .}}{{end}}' > /tmp/bluearm-api.env
cd api
docker build -t bluearm-api:latest .
docker stop bluearm-api || true
docker rm bluearm-api || true
docker run -d --name bluearm-api --restart unless-stopped --env-file /tmp/bluearm-api.env -p 8080:8080 bluearm-api:latest
sleep 10
echo HEALTH_CODE_START
curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/health || true
echo
echo REPORT_CODE_START
curl -sS -o /dev/null -w '%{http_code}' 'http://127.0.0.1:8080/api/v1/manufacturing/reports/work-order-status?page=1&pageSize=50&date_from=2026-08-02&date_to=2026-09-01' || true
echo
echo DEPLOY_MFG_ROUTES_DONE'''
last = await run_shell(phase, timeout=900)
out = last.get('output') or ''
health_code = report_code = None
if 'HEALTH_CODE_START' in out:
    health_code = out.split('HEALTH_CODE_START', 1)[1].strip().splitlines()[0].strip()
if 'REPORT_CODE_START' in out:
    report_code = out.split('REPORT_CODE_START', 1)[1].strip().splitlines()[0].strip()
result = {'ok': last.get('status')=='Success' and 'DEPLOY_MFG_ROUTES_DONE' in out and health_code=='200' and report_code=='401', 'health_code': health_code, 'report_code': report_code, 'last': last}
