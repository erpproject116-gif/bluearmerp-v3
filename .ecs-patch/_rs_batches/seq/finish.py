INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'

async def run_shell(script, timeout=120):
    r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': script, 'Timeout': int(timeout), 'InstanceId': [INSTANCE]})
    invoke_id = r['InvokeId']
    for _ in range(200):
        await asyncio.sleep(3)
        d = await call_cli(product='Ecs', action='DescribeInvocationResults', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'InvokeId': invoke_id, 'ContentEncoding': 'PlainText'})
        items = d.get('Invocation', {}).get('InvocationResults', {}).get('InvocationResult', [])
        if not items:
            continue
        item = items[0]
        st = item.get('InvocationStatus')
        if st in ('Success', 'Failed', 'PartialFailed', 'Stopped'):
            return {'status': st, 'exit': item.get('ExitCode'), 'output': (item.get('Output') or '')[-1000:], 'invoke_id': invoke_id}
    return {'status': 'Timeout', 'invoke_id': invoke_id}
outs = []

FINISH = "set -e\nxxd -r -p /tmp/mfg-main.hex > /tmp/mfg-main.tgz\nfile /tmp/mfg-main.tgz\nrm -f /root/bluearmerp-v3/api/internal/modules/manufacturing/wo_so_link_slip.go\nmkdir -p /root/bluearmerp-v3/api/internal/platform\ntar -xzf /tmp/mfg-main.tgz -C /root/bluearmerp-v3/api\ngrep -n from-sales-order /root/bluearmerp-v3/api/internal/modules/manufacturing/routes.go\ngrep -n sales-order-lines /root/bluearmerp-v3/api/internal/modules/manufacturing/routes.go\nls /root/bluearmerp-v3/api/internal/platform/processpolicy | head\ndocker inspect bluearm-api --format '{{range .Config.Env}}{{println .}}{{end}}' > /tmp/bluearm-api.env\ncd /root/bluearmerp-v3/api\ndocker build -t bluearm-api:latest .\ndocker stop bluearm-api || true\ndocker rm bluearm-api || true\ndocker run -d --name bluearm-api --restart unless-stopped --env-file /tmp/bluearm-api.env -p 8080:8080 bluearm-api:latest\nsleep 6\ndocker ps --filter name=bluearm-api --format '{{.Names}} {{.Status}}'\ncode=$(curl -sS -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:8080/api/v1/manufacturing/work-orders/from-sales-order/1 || true)\necho POST_from_so=$code\ncode=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/api/v1/manufacturing/work-orders/sales-order-lines/open || true)\necho GET_open=$code\ndocker exec bluearm-api sh -c 'grep -a -o from-sales-order /proc/1/exe | head -1'\necho DEPLOY_DONE"
outs.append({'step':'FINISH', **(await run_shell(FINISH, timeout=900))})
result={'outs':outs}