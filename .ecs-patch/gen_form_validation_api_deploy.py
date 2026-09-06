import base64
import pathlib

INSTANCE = "i-t4n5tdhzaktd0x6tc34w"
REGION = "ap-southeast-1"
root = pathlib.Path(__file__).resolve().parents[1]
files = [
    "api/internal/platform/validation/partner_contact.go",
    "api/internal/platform/validation/ph_tin.go",
    "api/internal/platform/validation/validation_test.go",
]

upload_cmds = []
for f in files:
    b64 = base64.b64encode((root / f).read_bytes()).decode("ascii")
    safe = b64.replace("'", "'\\''")
    dirpath = str(pathlib.Path(f).parent).replace("\\", "/")
    upload_cmds.append(f"mkdir -p {dirpath}")
    upload_cmds.append(f"printf '%s' '{safe}' | base64 -d > {f}")

finish_body = "\n".join(
    [
        "set -e",
        "cd /root/bluearmerp-v3",
        *upload_cmds,
        "grep -n PHTINFormatHint api/internal/platform/validation/ph_tin.go | head -1",
        "docker inspect bluearm-api --format '{{range .Config.Env}}{{println .}}{{end}}' > /tmp/bluearm-api.env",
        "cd api",
        "docker build --no-cache -t bluearm-api:latest .",
        "docker stop bluearm-api || true",
        "docker rm bluearm-api || true",
        "docker run -d --name bluearm-api --restart unless-stopped --env-file /tmp/bluearm-api.env -p 8080:8080 bluearm-api:latest",
        "sleep 10",
        "echo HEALTH_CODE_START",
        "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/health || true",
        "echo",
        "echo DEPLOY_FORM_VALIDATION_API_DONE",
    ]
)

script = f"""INSTANCE = '{INSTANCE}'
REGION = '{REGION}'

async def run_shell(script, timeout=120):
    r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={{'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': script, 'Timeout': int(timeout), 'InstanceId': [INSTANCE]}})
    invoke_id = r['InvokeId']
    for _ in range(300):
        await asyncio.sleep(3)
        d = await call_cli(product='Ecs', action='DescribeInvocationResults', version='2014-05-26', region=REGION, params={{'RegionId': REGION, 'InvokeId': invoke_id, 'ContentEncoding': 'PlainText'}})
        items = d.get('Invocation', {{}}).get('InvocationResults', {{}}).get('InvocationResult', [])
        if not items:
            continue
        item = items[0]
        st = item.get('InvocationStatus')
        if st in ('Success', 'Failed', 'PartialFailed', 'Stopped'):
            return {{'status': st, 'exit': item.get('ExitCode'), 'output': (item.get('Output') or '')[-8000:]}}
    return {{'status': 'Timeout', 'invoke_id': invoke_id}}

finish = \"\"\"{finish_body}\"\"\"
last = await run_shell(finish, timeout=900)
result = {{'ok': last.get('status')=='Success' and 'DEPLOY_FORM_VALIDATION_API_DONE' in (last.get('output') or ''), 'last': last}}
"""

out = pathlib.Path(__file__).with_name("_deploy_form_validation_api.py")
out.write_text(script, encoding="utf-8", newline="\n")
print("Wrote", out, "chars", out.stat().st_size)
