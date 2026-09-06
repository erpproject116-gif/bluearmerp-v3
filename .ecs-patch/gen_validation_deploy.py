import base64
import io
import pathlib
import tarfile

root = pathlib.Path(__file__).resolve().parents[1]
files = [
    "api/internal/platform/validation/digits.go",
    "api/internal/platform/validation/email.go",
    "api/internal/platform/validation/partner_contact.go",
    "api/internal/platform/validation/ph_mobile.go",
    "api/internal/platform/validation/ph_phone.go",
    "api/internal/platform/validation/ph_tin.go",
    "api/internal/platform/validation/validation_test.go",
    "api/internal/modules/inventory/partners.go",
    "api/internal/modules/demoonboard/phone.go",
    "api/internal/modules/demoonboard/routes.go",
]

buf = io.BytesIO()
with tarfile.open(fileobj=buf, mode="w:gz") as tar:
    for f in files:
        tar.add(root / f, arcname=f)

b64 = base64.b64encode(buf.getvalue()).decode("ascii")
out = root / ".ecs-patch" / "_deploy_validation_upload.py"
chunk = 3500
parts = [b64[i : i + chunk] for i in range(0, len(b64), chunk)]

lines = [
    "INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'",
    "REGION = 'ap-southeast-1'",
    "",
    "async def run_shell(script, timeout=120):",
    "    r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': script, 'Timeout': int(timeout), 'InstanceId': [INSTANCE]})",
    "    invoke_id = r['InvokeId']",
    "    for _ in range(260):",
    "        await asyncio.sleep(3)",
    "        d = await call_cli(product='Ecs', action='DescribeInvocationResults', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'InvokeId': invoke_id, 'ContentEncoding': 'PlainText'})",
    "        items = d.get('Invocation', {}).get('InvocationResults', {}).get('InvocationResult', [])",
    "        if not items:",
    "            continue",
    "        item = items[0]",
    "        st = item.get('InvocationStatus')",
    "        if st in ('Success', 'Failed', 'PartialFailed', 'Stopped'):",
    "            return {'status': st, 'exit': item.get('ExitCode'), 'output': (item.get('Output') or '')[-5000:]}",
    "    return {'status': 'Timeout', 'invoke_id': invoke_id}",
    "",
    "outs = []",
    "outs.append(await run_shell('rm -f /tmp/validation.tgz.b64; echo RESET'))",
]

for i, part in enumerate(parts):
    safe = part.replace("'", "'\\''")
    lines.append(f"outs.append(await run_shell(\"printf '%s' '{safe}' >> /tmp/validation.tgz.b64\\necho P{i}\"))")

lines.extend(
    [
        'finish = """set -e',
        "cd /root/bluearmerp-v3",
        "mkdir -p api/internal/platform/validation",
        "base64 -d /tmp/validation.tgz.b64 | tar -xzf - -C .",
        "grep -n ValidatePartnerContact api/internal/modules/inventory/partners.go | head -1",
        "grep -n NormalizePHMobileLocal api/internal/platform/validation/ph_mobile.go | head -1",
        "docker inspect bluearm-api --format '{{range .Config.Env}}{{println .}}{{end}}' > /tmp/bluearm-api.env",
        "cd api",
        "docker build --no-cache -t bluearm-api:latest .",
        "docker stop bluearm-api || true",
        "docker rm bluearm-api || true",
        "docker run -d --name bluearm-api --restart unless-stopped --env-file /tmp/bluearm-api.env -p 8080:8080 bluearm-api:latest",
        "sleep 8",
        "docker exec bluearm-api grep -ao validation.ValidatePartnerContact /server | head -1 || true",
        "echo HEALTH_CODE_START",
        "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/health || true",
        "echo",
        'echo DEPLOY_VALIDATION_DONE"""',
        "last = await run_shell(finish, timeout=900)",
        "result = {'upload_ok': all(s.get('status')=='Success' for s in outs), 'build_ok': last.get('status')=='Success' and 'DEPLOY_VALIDATION_DONE' in (last.get('output') or ''), 'last': last, 'parts': len(outs)}",
    ]
)

out.write_text("\n".join(lines), encoding="utf-8")
print(f"Wrote {out} with {len(parts)} b64 chunks, {len(b64)} chars")
