import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
m = json.loads((ROOT / "_chunks_manifest.json").read_text(encoding="utf-8"))
outdir = ROOT / "_rs_batches"
outdir.mkdir(exist_ok=True)

HEADER = """INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
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
"""


def emit_printf(path: str, part: str, tag: str) -> str:
    return (
        "outs.append(await run_shell(\"printf '%s' '"
        + part
        + "' >> "
        + path
        + "\\necho "
        + tag
        + "\"))\n"
    )


b1 = [HEADER, "outs.append(await run_shell('rm -f /tmp/slip.go.hex /tmp/routes.go.hex\\necho RESET'))\n"]
for i, part in enumerate(m["routes_chunks"]):
    b1.append(emit_printf("/tmp/routes.go.hex", part, f"R{i}"))
for i, part in enumerate(m["slip_chunks"][:7]):
    b1.append(emit_printf("/tmp/slip.go.hex", part, f"S{i}"))
b1.append("result = {'ok': all(s.get('status')=='Success' for s in outs), 'n': len(outs)}\n")
(outdir / "batch1.py").write_text("".join(b1), encoding="utf-8", newline="\n")

b2 = [HEADER]
for i, part in enumerate(m["slip_chunks"][7:], start=7):
    b2.append(emit_printf("/tmp/slip.go.hex", part, f"S{i}"))
b2.append("result = {'ok': all(s.get('status')=='Success' for s in outs), 'n': len(outs)}\n")
(outdir / "batch2.py").write_text("".join(b2), encoding="utf-8", newline="\n")

finish = """set -e
xxd -r -p /tmp/slip.go.hex > /root/bluearmerp-v3/api/internal/modules/manufacturing/wo_so_link_slip.go
xxd -r -p /tmp/routes.go.hex > /root/bluearmerp-v3/api/internal/modules/manufacturing/routes.go
rm -f /root/bluearmerp-v3/api/internal/modules/manufacturing/wo_so_link.go
wc -c /tmp/slip.go.hex /tmp/routes.go.hex
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

b3 = (
    HEADER
    + "outs.append(await run_shell("
    + repr(finish)
    + ", timeout=900))\n"
    + "result = {'ok': outs[-1].get('status')=='Success' and 'DEPLOY_BOM_MSG_DONE' in (outs[-1].get('output') or ''), 'last': outs[-1]}\n"
)
(outdir / "batch3.py").write_text(b3, encoding="utf-8", newline="\n")

for p in sorted(outdir.glob("batch*.py")):
    print(p.name, p.stat().st_size)
