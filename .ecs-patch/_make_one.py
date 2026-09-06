from pathlib import Path
import json

base = Path(__file__).resolve().parent
b64 = (base / "full3.b64").read_text(encoding="utf-8").strip()
script = f"""INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
CONTENT = {json.dumps(b64)}
TIMEOUT = 120
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={{'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'Base64', 'CommandContent': CONTENT, 'Timeout': TIMEOUT, 'InstanceId': [INSTANCE]}})
invoke_id = r['InvokeId']
out = None
for _ in range(60):
    await asyncio.sleep(3)
    d = await call_cli(product='Ecs', action='DescribeInvocationResults', version='2014-05-26', region=REGION, params={{'RegionId': REGION, 'InvokeId': invoke_id, 'ContentEncoding': 'PlainText'}})
    items = d.get('Invocation', {{}}).get('InvocationResults', {{}}).get('InvocationResult', [])
    if not items:
        continue
    item = items[0]
    st = item.get('InvocationStatus')
    if st in ('Success', 'Failed', 'PartialFailed', 'Stopped'):
        out = {{'status': st, 'exit': item.get('ExitCode'), 'output': (item.get('Output') or '')[-4000:], 'invoke_id': invoke_id}}
        break
result = out or {{'status': 'Timeout', 'invoke_id': invoke_id}}
"""
(base / "_rs_full3.py").write_text(script, encoding="utf-8")
print("wrote_full3", len(script))

b64c = (base / "phaseC2.b64").read_text(encoding="utf-8").strip()
scriptc = f"""INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
CONTENT = {json.dumps(b64c)}
TIMEOUT = 900
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={{'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'Base64', 'CommandContent': CONTENT, 'Timeout': TIMEOUT, 'InstanceId': [INSTANCE]}})
invoke_id = r['InvokeId']
out = None
for _ in range(320):
    await asyncio.sleep(3)
    d = await call_cli(product='Ecs', action='DescribeInvocationResults', version='2014-05-26', region=REGION, params={{'RegionId': REGION, 'InvokeId': invoke_id, 'ContentEncoding': 'PlainText'}})
    items = d.get('Invocation', {{}}).get('InvocationResults', {{}}).get('InvocationResult', [])
    if not items:
        continue
    item = items[0]
    st = item.get('InvocationStatus')
    if st in ('Success', 'Failed', 'PartialFailed', 'Stopped'):
        out = {{'status': st, 'exit': item.get('ExitCode'), 'output': (item.get('Output') or '')[-8000:], 'invoke_id': invoke_id}}
        break
result = out or {{'status': 'Timeout', 'invoke_id': invoke_id}}
"""
(base / "_rs_phaseC2.py").write_text(scriptc, encoding="utf-8")
print("wrote_phaseC2", len(scriptc))
