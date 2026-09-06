INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'

async def run_shell(script, timeout=120):
    r = await call_cli(
        product='Ecs',
        action='RunCommand',
        version='2014-05-26',
        region=REGION,
        params={
            'RegionId': REGION,
            'Type': 'RunShellScript',
            'ContentEncoding': 'PlainText',
            'CommandContent': script,
            'Timeout': int(timeout),
            'InstanceId': [INSTANCE],
        },
    )
    invoke_id = r['InvokeId']
    for _ in range(150):
        await asyncio.sleep(3)
        d = await call_cli(
            product='Ecs',
            action='DescribeInvocationResults',
            version='2014-05-26',
            region=REGION,
            params={'RegionId': REGION, 'InvokeId': invoke_id, 'ContentEncoding': 'PlainText'},
        )
        items = d.get('Invocation', {}).get('InvocationResults', {}).get('InvocationResult', [])
        if not items:
            continue
        item = items[0]
        st = item.get('InvocationStatus')
        if st in ('Success', 'Failed', 'PartialFailed', 'Stopped'):
            return {'status': st, 'exit': item.get('ExitCode'), 'output': (item.get('Output') or '')[-3000:]}
    return {'status': 'Timeout', 'invoke_id': invoke_id}

outs = []
outs.append(await run_shell("set -e\nxxd -r -p /tmp/slip.go.hex > /root/bluearmerp-v3/api/internal/modules/manufacturing/wo_so_link_slip.go\nxxd -r -p /tmp/routes.go.hex > /root/bluearmerp-v3/api/internal/modules/manufacturing/routes.go\nrm -f /root/bluearmerp-v3/api/internal/modules/manufacturing/wo_so_link.go\nwc -c /tmp/slip.go.hex /tmp/routes.go.hex\ngrep -n optionalInt64Query /root/bluearmerp-v3/api/internal/modules/manufacturing/wo_so_link_slip.go\ngrep -n 'No active BOM' /root/bluearmerp-v3/api/internal/modules/manufacturing/wo_so_link_slip.go\nsed -n '144,150p' /root/bluearmerp-v3/api/internal/modules/manufacturing/wo_so_link_slip.go\ndocker inspect bluearm-api --format '{{range .Config.Env}}{{println .}}{{end}}' > /tmp/bluearm-api.env\ncd /root/bluearmerp-v3/api\ndocker build -t bluearm-api:latest .\ndocker stop bluearm-api || true\ndocker rm bluearm-api || true\ndocker run -d --name bluearm-api --restart unless-stopped --env-file /tmp/bluearm-api.env -p 8080:8080 bluearm-api:latest\nsleep 5\ndocker ps --filter name=bluearm-api --format '{{.Names}} {{.Status}}'\ncode=$(curl -sS -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:8080/api/v1/manufacturing/work-orders/from-sales-order/1 || true)\necho POST=$code\necho DEPLOY_BOM_MSG_DONE", timeout=900))
result = {'ok': outs[-1].get('status')=='Success' and 'DEPLOY_BOM_MSG_DONE' in (outs[-1].get('output') or ''), 'last': outs[-1]}
