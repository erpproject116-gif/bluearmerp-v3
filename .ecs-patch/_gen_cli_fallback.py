from pathlib import Path
import json
import hashlib

p = Path(__file__).resolve().parent
files = ["full1.b64", "full2.b64", "full3.b64", "phaseC2.b64"]
timeouts = {"full1.b64": 120, "full2.b64": 120, "full3.b64": 120, "phaseC2.b64": 900}
parts = []
for n in files:
    b64 = (p / n).read_text(encoding="utf-8").strip()
    parts.append((n, b64, timeouts[n]))

lines = []
lines.append("INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'")
lines.append("REGION = 'ap-southeast-1'")
lines.append("PAYLOADS = [")
for n, b64, to in parts:
    lines.append(f"    ({json.dumps(n)}, {to}, {json.dumps(b64)}),")
lines.append("]")
lines.append(
    """
async def wait_invoke(invoke_id, timeout_s):
    loops = max(40, int(timeout_s / 3) + 5)
    for _ in range(loops):
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
            return {'status': st, 'exit': item.get('ExitCode'), 'output': (item.get('Output') or '')[-8000:]}
    return {'status': 'Timeout', 'invoke_id': invoke_id}

outs = []
failed = False
for name, timeout, content in PAYLOADS:
    r = await call_cli(
        product='Ecs',
        action='RunCommand',
        version='2014-05-26',
        region=REGION,
        params={
            'RegionId': REGION,
            'Type': 'RunShellScript',
            'ContentEncoding': 'Base64',
            'CommandContent': content,
            'Timeout': int(timeout),
            'InstanceId': [INSTANCE],
        },
    )
    inv = r['InvokeId']
    w = await wait_invoke(inv, timeout)
    outs.append({'name': name, 'invoke_id': inv, **w})
    if w.get('status') != 'Success' or int(w.get('exit') or 1) != 0:
        failed = True
        break
result = {'ok': (not failed), 'steps': outs}
"""
)
script = "\n".join(lines)
out = p / "_run_cli_fallback.py"
out.write_text(script, encoding="utf-8")
print("wrote", out, "bytes", len(script.encode("utf-8")))
for n, b64, _ in parts:
    print(n, "md5", hashlib.md5(b64.encode()).hexdigest(), "len", len(b64))
