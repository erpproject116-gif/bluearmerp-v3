import pathlib

src = pathlib.Path(__file__).resolve().parent
text = (src / "deploy_mfg_rs.py").read_text(encoding="utf-8")
start = text.index("HEX = '''") + len("HEX = '''")
end = text.index("'''", start)
HEX = text[start:end]
FINISH_start = text.index('FINISH = """') + len('FINISH = """')
FINISH_end = text.index('"""', FINISH_start)
FINISH = text[FINISH_start:FINISH_end]
chunk = 1800
parts = [HEX[i : i + chunk] for i in range(0, len(HEX), chunk)]
out = src / "_rs_batches" / "one_parts"
out.mkdir(exist_ok=True)

for idx, part in enumerate(parts):
    off = idx * chunk if idx < len(parts) - 1 or len(part) == chunk else idx * chunk
    # off is always idx * chunk for echo label matching deploy_mfg_rs
    off = idx * chunk
    script = f"""INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
PART = {part!r}
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={{'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': \"printf '%s' '\" + PART + \"' >> /tmp/mfg-main.hex\\necho C{off}\", 'Timeout': 120, 'InstanceId': [INSTANCE]}})
invoke_id = r['InvokeId']
out = None
for _ in range(120):
    await asyncio.sleep(2)
    d = await call_cli(product='Ecs', action='DescribeInvocationResults', version='2014-05-26', region=REGION, params={{'RegionId': REGION, 'InvokeId': invoke_id, 'ContentEncoding': 'PlainText'}})
    items = d.get('Invocation', {{}}).get('InvocationResults', {{}}).get('InvocationResult', [])
    if not items:
        continue
    item = items[0]
    st = item.get('InvocationStatus')
    if st in ('Success', 'Failed', 'PartialFailed', 'Stopped'):
        out = item
        break
result = {{'step': 'C{off}', 'part_len': len(PART), 'invoke_id': invoke_id, 'status': None if out is None else out.get('InvocationStatus'), 'exit': None if out is None else out.get('ExitCode'), 'output': None if out is None else (out.get('Output') or '')[-300:]}}
"""
    (out / f"p{idx:02d}.py").write_text(script, encoding="utf-8", newline="\n")

# reset
(out / "p_reset.py").write_text(
    """INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': 'rm -f /tmp/mfg-main.hex\\necho RESET', 'Timeout': 120, 'InstanceId': [INSTANCE]})
invoke_id = r['InvokeId']
out = None
for _ in range(60):
    await asyncio.sleep(2)
    d = await call_cli(product='Ecs', action='DescribeInvocationResults', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'InvokeId': invoke_id, 'ContentEncoding': 'PlainText'})
    items = d.get('Invocation', {}).get('InvocationResults', {}).get('InvocationResult', [])
    if not items:
        continue
    item = items[0]
    if item.get('InvocationStatus') in ('Success', 'Failed', 'PartialFailed', 'Stopped'):
        out = item
        break
result = {'step': 'RESET', 'status': None if out is None else out.get('InvocationStatus'), 'output': None if out is None else out.get('Output')}
""",
    encoding="utf-8",
    newline="\n",
)

# verify length
(out / "p_verify.py").write_text(
    f"""INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
EXPECTED = {len(HEX)}
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={{'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': 'wc -c /tmp/mfg-main.hex; head -c 32 /tmp/mfg-main.hex; echo; tail -c 32 /tmp/mfg-main.hex; echo', 'Timeout': 120, 'InstanceId': [INSTANCE]}})
invoke_id = r['InvokeId']
out = None
for _ in range(60):
    await asyncio.sleep(2)
    d = await call_cli(product='Ecs', action='DescribeInvocationResults', version='2014-05-26', region=REGION, params={{'RegionId': REGION, 'InvokeId': invoke_id, 'ContentEncoding': 'PlainText'}})
    items = d.get('Invocation', {{}}).get('InvocationResults', {{}}).get('InvocationResult', [])
    if not items:
        continue
    item = items[0]
    if item.get('InvocationStatus') in ('Success', 'Failed', 'PartialFailed', 'Stopped'):
        out = item
        break
result = {{'expected': EXPECTED, 'status': None if out is None else out.get('InvocationStatus'), 'output': None if out is None else out.get('Output')}}
""",
    encoding="utf-8",
    newline="\n",
)

# finish
(out / "p_finish.py").write_text(
    f"""INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
FINISH = {FINISH!r}
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={{'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': FINISH, 'Timeout': 900, 'InstanceId': [INSTANCE]}})
invoke_id = r['InvokeId']
out = None
for _ in range(400):
    await asyncio.sleep(3)
    d = await call_cli(product='Ecs', action='DescribeInvocationResults', version='2014-05-26', region=REGION, params={{'RegionId': REGION, 'InvokeId': invoke_id, 'ContentEncoding': 'PlainText'}})
    items = d.get('Invocation', {{}}).get('InvocationResults', {{}}).get('InvocationResult', [])
    if not items:
        continue
    item = items[0]
    if item.get('InvocationStatus') in ('Success', 'Failed', 'PartialFailed', 'Stopped'):
        out = item
        break
result = {{'step': 'FINISH', 'invoke_id': invoke_id, 'status': None if out is None else out.get('InvocationStatus'), 'exit': None if out is None else out.get('ExitCode'), 'output': None if out is None else (out.get('Output') or '')[-8000:]}}
""",
    encoding="utf-8",
    newline="\n",
)

print("parts", len(parts), "hex_len", len(HEX), "sample", (out / "p00.py").stat().st_size)
