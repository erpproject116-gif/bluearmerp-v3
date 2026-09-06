from pathlib import Path
import json

base = Path(__file__).resolve().parent
# remaining chunks after 0,1 already uploaded
chunks = [(base / f"chunk{i}.b64").read_text(encoding="utf-8").strip() for i in range(2, 12)]
phase = (base / "phaseC2.b64").read_text(encoding="utf-8").strip()

script = f"""INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
CHUNKS = {json.dumps(chunks)}
PHASE = {json.dumps(phase)}

async def wait_invoke(invoke_id, timeout_s=120):
    loops = max(40, int(timeout_s / 3) + 5)
    for _ in range(loops):
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

async def run_b64(content, timeout=120):
    r = await call_cli(
        product='Ecs',
        action='RunCommand',
        version='2014-05-26',
        region=REGION,
        params={{
            'RegionId': REGION,
            'Type': 'RunShellScript',
            'ContentEncoding': 'Base64',
            'CommandContent': content,
            'Timeout': int(timeout),
            'InstanceId': [INSTANCE],
        }},
    )
    return await wait_invoke(r['InvokeId'], timeout)

outs = []
failed = None
for i, c in enumerate(CHUNKS):
    outs.append(await run_b64(c, 120))
    if outs[-1].get('status') != 'Success' or int(outs[-1].get('exit') or 1) != 0:
        failed = 'chunk' + str(i + 2)
        break
if failed is None:
    outs.append(await run_b64(PHASE, 900))
    ok = outs[-1].get('status') == 'Success' and int(outs[-1].get('exit') or 1) == 0
    result = {{'ok': ok, 'steps': outs}}
else:
    result = {{'ok': False, 'step': failed, 'steps': outs}}
"""
out = base / "_rs_rest.py"
out.write_text(script, encoding="utf-8")
print("wrote", out.stat().st_size)
