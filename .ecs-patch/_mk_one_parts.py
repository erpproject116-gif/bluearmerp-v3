import pathlib

src = pathlib.Path(__file__).resolve().parent
text = (src / "deploy_mfg_rs.py").read_text(encoding="utf-8")
start = text.index("HEX = '''") + len("HEX = '''")
end = text.index("'''", start)
HEX = text[start:end]
chunk = 1800
# Generate one-part RunScripts for indices 6..32 and finish
out = src / "_rs_batches" / "one_parts"
out.mkdir(exist_ok=True)
parts = [HEX[i : i + chunk] for i in range(0, len(HEX), chunk)]
for idx in range(6, len(parts)):
    part = parts[idx]
    off = idx * chunk
    script = f"""INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
PART = {part!r}
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={{'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': \"printf '%s' '\" + PART + \"' >> /tmp/mfg-main.hex\\necho C{off}\", 'Timeout': 120, 'InstanceId': [INSTANCE]}})
invoke_id = r['InvokeId']
out = None
for _ in range(200):
    await asyncio.sleep(3)
    d = await call_cli(product='Ecs', action='DescribeInvocationResults', version='2014-05-26', region=REGION, params={{'RegionId': REGION, 'InvokeId': invoke_id, 'ContentEncoding': 'PlainText'}})
    items = d.get('Invocation', {{}}).get('InvocationResults', {{}}).get('InvocationResult', [])
    if not items:
        continue
    item = items[0]
    st = item.get('InvocationStatus')
    if st in ('Success', 'Failed', 'PartialFailed', 'Stopped'):
        out = item
        break
result = {{'step': 'C{off}', 'invoke_id': invoke_id, 'status': None if out is None else out.get('InvocationStatus'), 'exit': None if out is None else out.get('ExitCode'), 'output': None if out is None else (out.get('Output') or '')[-500:]}}
"""
    path = out / f"p{idx:02d}.py"
    path.write_text(script, encoding="utf-8", newline="\n")
print("wrote", len(parts) - 6, "scripts, sample size", (out / "p06.py").stat().st_size)
