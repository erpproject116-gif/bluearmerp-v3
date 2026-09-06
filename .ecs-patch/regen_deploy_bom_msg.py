from pathlib import Path

ROOT = Path(__file__).resolve().parent


def lf_bytes(p: Path) -> bytes:
    text = p.read_bytes().decode("utf-8").replace("\r\n", "\n").replace("\r", "\n")
    data = text.encode("utf-8")
    p.write_bytes(data)
    return data


slip = lf_bytes(ROOT / "internal/modules/manufacturing/wo_so_link_slip.go")
routes = lf_bytes(ROOT / "internal/modules/manufacturing/routes.go")
print("slip", len(slip), "routes", len(routes))

finish = r"""set -e
xxd -r -p /tmp/slip.go.hex > /root/bluearmerp-v3/api/internal/modules/manufacturing/wo_so_link_slip.go
xxd -r -p /tmp/routes.go.hex > /root/bluearmerp-v3/api/internal/modules/manufacturing/routes.go
rm -f /root/bluearmerp-v3/api/internal/modules/manufacturing/wo_so_link.go
grep -n 'args := append(args, pageSize' /root/bluearmerp-v3/api/internal/modules/manufacturing/wo_so_link_slip.go && exit 2 || true
grep -n optionalInt64Query /root/bluearmerp-v3/api/internal/modules/manufacturing/wo_so_link_slip.go
grep -n 'No active BOM' /root/bluearmerp-v3/api/internal/modules/manufacturing/wo_so_link_slip.go
sed -n '144,150p' /root/bluearmerp-v3/api/internal/modules/manufacturing/wo_so_link_slip.go
docker inspect bluearm-api --format '{{range .Config.Env}}{{println .}}{{end}}' > /tmp/bluearm-api.env
cd /root/bluearmerp-v3/api
docker build -t bluearm-api:latest .
docker stop bluearm-api || true
docker rm bluearm-api || true
docker run -d --name bluearm-api --restart unless-stopped --env-file /tmp/bluearm-api.env -p 8080:8080 bluearm-api:latest
sleep 5
docker ps --filter name=bluearm-api --format '{{.Names}} {{.Status}}'
code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:8080/api/v1/manufacturing/work-orders/from-sales-order/1 || true)
echo POST=$code
echo DEPLOY_BOM_MSG_DONE"""

script = f"""INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
SLIP_HEX = '''{slip.hex()}'''
ROUTES_HEX = '''{routes.hex()}'''
FINISH = \"\"\"{finish}\"\"\"

async def run_shell(script, timeout=120):
    r = await call_cli(
        product='Ecs',
        action='RunCommand',
        version='2014-05-26',
        region=REGION,
        params={{
            'RegionId': REGION,
            'Type': 'RunShellScript',
            'ContentEncoding': 'PlainText',
            'CommandContent': script,
            'Timeout': int(timeout),
            'InstanceId': [INSTANCE],
        }},
    )
    invoke_id = r['InvokeId']
    for _ in range(150):
        await asyncio.sleep(3)
        d = await call_cli(
            product='Ecs',
            action='DescribeInvocationResults',
            version='2014-05-26',
            region=REGION,
            params={{'RegionId': REGION, 'InvokeId': invoke_id, 'ContentEncoding': 'PlainText'}},
        )
        items = d.get('Invocation', {{}}).get('InvocationResults', {{}}).get('InvocationResult', [])
        if not items:
            continue
        item = items[0]
        st = item.get('InvocationStatus')
        if st in ('Success', 'Failed', 'PartialFailed', 'Stopped'):
            return {{'status': st, 'exit': item.get('ExitCode'), 'output': (item.get('Output') or '')[-5000:]}}
    return {{'status': 'Timeout', 'invoke_id': invoke_id}}

outs = []
outs.append(await run_shell('rm -f /tmp/slip.go.hex /tmp/routes.go.hex\\necho RESET'))
chunk = 1800
for i in range(0, len(ROUTES_HEX), chunk):
    part = ROUTES_HEX[i:i+chunk]
    outs.append(await run_shell(\"printf '%s' '\" + part + \"' >> /tmp/routes.go.hex\\necho R\" + str(i)))
for i in range(0, len(SLIP_HEX), chunk):
    part = SLIP_HEX[i:i+chunk]
    outs.append(await run_shell(\"printf '%s' '\" + part + \"' >> /tmp/slip.go.hex\\necho S\" + str(i)))
outs.append(await run_shell(FINISH, timeout=900))
failed = [s for s in outs if s.get('status') != 'Success']
result = {{
    'ok': len(failed) == 0 and 'DEPLOY_BOM_MSG_DONE' in ((outs[-1] or {{}}).get('output') or ''),
    'failed_count': len(failed),
    'last': outs[-1] if outs else None,
}}
"""

out = ROOT / "deploy_bom_msg_rs.py"
out.write_text(script, encoding="utf-8", newline="\n")
print("wrote", out, out.stat().st_size)
lines = slip.decode().splitlines()
print("L146", lines[145])
print("has_bom", any("No active BOM" in l for l in lines))
print("has_opt", any("optionalInt64Query" in l for l in lines))
