from pathlib import Path
import json

base = Path(__file__).resolve().parent
template_head = """INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
CONTENT = %s
TIMEOUT = %d
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'Base64', 'CommandContent': CONTENT, 'Timeout': TIMEOUT, 'InstanceId': [INSTANCE]})
invoke_id = r['InvokeId']
out = None
for _ in range(%d):
    await asyncio.sleep(3)
    d = await call_cli(product='Ecs', action='DescribeInvocationResults', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'InvokeId': invoke_id, 'ContentEncoding': 'PlainText'})
    items = d.get('Invocation', {}).get('InvocationResults', {}).get('InvocationResult', [])
    if not items:
        continue
    item = items[0]
    st = item.get('InvocationStatus')
    if st in ('Success', 'Failed', 'PartialFailed', 'Stopped'):
        out = {'status': st, 'exit': item.get('ExitCode'), 'output': (item.get('Output') or '')[-4000:], 'invoke_id': invoke_id}
        break
result = out or {'status': 'Timeout', 'invoke_id': invoke_id}
"""
for i in range(2, 12):
    b64 = (base / f"chunk{i}.b64").read_text(encoding="utf-8").strip()
    script = template_head % (json.dumps(b64), 120, 60)
    (base / f"_rs_c{i}.py").write_text(script, encoding="utf-8")
    print(f"_rs_c{i}.py", len(script))
b64 = (base / "phaseC2.b64").read_text(encoding="utf-8").strip()
script = template_head % (json.dumps(b64), 900, 320)
(base / "_rs_phase.py").write_text(script, encoding="utf-8")
print("_rs_phase.py", len(script))
