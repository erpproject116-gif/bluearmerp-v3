from pathlib import Path

ROOT = Path(__file__).resolve().parent
qdir = ROOT / "internal/modules/quality"
routes = (qdir / "routes.go").read_bytes()
insp = (qdir / "wo_inspection.go").read_bytes()
chunk = 1800
r_hex = routes.hex()
i_hex = insp.hex()
r_chunks = [r_hex[i : i + chunk] for i in range(0, len(r_hex), chunk)]
i_chunks = [i_hex[i : i + chunk] for i in range(0, len(i_hex), chunk)]

HEADER = """INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'

async def run_shell(script, timeout=120):
    r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': script, 'Timeout': int(timeout), 'InstanceId': [INSTANCE]})
    invoke_id = r['InvokeId']
    for _ in range(220):
        await asyncio.sleep(3)
        d = await call_cli(product='Ecs', action='DescribeInvocationResults', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'InvokeId': invoke_id, 'ContentEncoding': 'PlainText'})
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

outdir = ROOT / "_rs_batches"
outdir.mkdir(exist_ok=True)

up = [HEADER, "outs.append(await run_shell('rm -f /tmp/qroutes.hex /tmp/qinsp.hex\\necho RESET'))\n"]
for i, c in enumerate(r_chunks):
    up.append(f"outs.append(await run_shell(\"printf '%s' '{c}' >> /tmp/qroutes.hex\\necho QR{i}\"))\n")
for i, c in enumerate(i_chunks):
    up.append(f"outs.append(await run_shell(\"printf '%s' '{c}' >> /tmp/qinsp.hex\\necho QI{i}\"))\n")
up.append("result = {'ok': all(s.get('status')=='Success' for s in outs), 'n': len(outs)}\n")
(outdir / "q_upload.py").write_text("".join(up), encoding="utf-8", newline="\n")

finish = r"""set -e
mkdir -p /root/bluearmerp-v3/api/internal/modules/quality
xxd -r -p /tmp/qroutes.hex > /root/bluearmerp-v3/api/internal/modules/quality/routes.go
xxd -r -p /tmp/qinsp.hex > /root/bluearmerp-v3/api/internal/modules/quality/wo_inspection.go
grep -n 'work-orders/{id}/inspection' /root/bluearmerp-v3/api/internal/modules/quality/routes.go
grep -n patchWoInspection /root/bluearmerp-v3/api/internal/modules/quality/wo_inspection.go
grep -c scan-context /root/bluearmerp-v3/api/internal/modules/manufacturing/routes.go
date >> /root/bluearmerp-v3/api/internal/modules/quality/.rebuild-bust
docker inspect bluearm-api --format '{{range .Config.Env}}{{println .}}{{end}}' > /tmp/bluearm-api.env
cd /root/bluearmerp-v3/api
docker build --no-cache -t bluearm-api:latest .
docker stop bluearm-api || true
docker rm bluearm-api || true
docker run -d --name bluearm-api --restart unless-stopped --env-file /tmp/bluearm-api.env -p 8080:8080 bluearm-api:latest
sleep 6
docker exec bluearm-api grep -ao patchWoInspection /server | head -1
docker exec bluearm-api grep -ao scan-context /server | head -1
echo QI_CODE_START
curl -sS -o /dev/null -w '%{http_code}' -X PATCH http://127.0.0.1:8080/api/v1/quality/work-orders/7/inspection || true
echo
echo SCAN_CODE_START
curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/api/v1/manufacturing/work-orders/7/scan-context || true
echo
echo DEPLOY_QUALITY_WO_DONE"""

build = HEADER + "outs.append(await run_shell(" + repr(finish) + ", timeout=900))\n"
build += "result = {'ok': outs[-1].get('status')=='Success' and 'DEPLOY_QUALITY_WO_DONE' in (outs[-1].get('output') or ''), 'last': outs[-1]}\n"
(outdir / "q_build.py").write_text(build, encoding="utf-8", newline="\n")

for p in [outdir / "q_upload.py", outdir / "q_build.py"]:
    print(p.name, p.stat().st_size)
