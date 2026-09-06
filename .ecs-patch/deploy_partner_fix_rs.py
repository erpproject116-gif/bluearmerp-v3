from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
api = ROOT / "api" / "internal" / "modules" / "inventory"
partners = (api / "partners.go").read_bytes()
helpers = (api / "helpers.go").read_bytes()
chunk = 1800
p_hex = partners.hex()
h_hex = helpers.hex()
p_chunks = [p_hex[i : i + chunk] for i in range(0, len(p_hex), chunk)]
h_chunks = [h_hex[i : i + chunk] for i in range(0, len(h_hex), chunk)]

HEADER = """INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
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
            return {'status': st, 'exit': item.get('ExitCode'), 'output': (item.get('Output') or '')[-4000:]}
    return {'status': 'Timeout', 'invoke_id': invoke_id}

outs = []
"""

lines = [HEADER, "outs.append(await run_shell('rm -f /tmp/partners.hex /tmp/helpers.hex\\necho RESET'))\n"]
for i, c in enumerate(p_chunks):
    lines.append(f"outs.append(await run_shell(\"printf '%s' '{c}' >> /tmp/partners.hex\\necho P{i}\"))\n")
for i, c in enumerate(h_chunks):
    lines.append(f"outs.append(await run_shell(\"printf '%s' '{c}' >> /tmp/helpers.hex\\necho H{i}\"))\n")

finish = """set -e
mkdir -p /root/bluearmerp-v3/api/internal/modules/inventory
xxd -r -p /tmp/partners.hex > /root/bluearmerp-v3/api/internal/modules/inventory/partners.go
xxd -r -p /tmp/helpers.hex > /root/bluearmerp-v3/api/internal/modules/inventory/helpers.go
grep -n createWithCode /root/bluearmerp-v3/api/internal/modules/inventory/partners.go
grep -n syncCodeSequence /root/bluearmerp-v3/api/internal/modules/inventory/helpers.go
date >> /root/bluearmerp-v3/api/internal/modules/inventory/.partner-fix-bust
docker inspect bluearm-api --format '{{range .Config.Env}}{{println .}}{{end}}' > /tmp/bluearm-api.env
cd /root/bluearmerp-v3/api
docker build --no-cache -t bluearm-api:latest .
docker stop bluearm-api || true
docker rm bluearm-api || true
docker run -d --name bluearm-api --restart unless-stopped --env-file /tmp/bluearm-api.env -p 8080:8080 bluearm-api:latest
sleep 8
docker exec bluearm-api grep -ao inventory.partner.create /server | head -1
echo HEALTH_CODE_START
curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/health || true
echo
echo DEPLOY_PARTNER_FIX_DONE"""

lines.append("outs.append(await run_shell(" + repr(finish) + ", timeout=900))\n")
lines.append("result = {'ok': outs[-1].get('status')=='Success' and 'DEPLOY_PARTNER_FIX_DONE' in (outs[-1].get('output') or ''), 'uploads': len(outs)-1, 'last': outs[-1]}\n")

script = "".join(lines)
out = Path(__file__).with_name("_deploy_partner_fix_script.py")
out.write_text(script, encoding="utf-8", newline="\n")
upload_only = "".join(lines[: len(lines) - 2]) + "result = {'ok': all(s.get('status')=='Success' for s in outs), 'n': len(outs)}\n"
Path(__file__).with_name("_deploy_partner_upload_only.py").write_text(upload_only, encoding="utf-8", newline="\n")
print(out)
print("bytes", out.stat().st_size)
print("upload_bytes", Path(__file__).with_name("_deploy_partner_upload_only.py").stat().st_size)
print("p_chunks", len(p_chunks), "h_chunks", len(h_chunks))
