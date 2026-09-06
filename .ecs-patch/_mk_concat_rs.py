import pathlib

patch = pathlib.Path(__file__).resolve().parent
name = "mfgpart1.b64"
timeout = 120
content = (patch / name).read_text(encoding="utf-8").strip()
chunk = 500
parts = [content[i : i + chunk] for i in range(0, len(content), chunk)]
lines = ["CONTENT = ("]
for p in parts:
    lines.append(f"    {p!r}")
lines.append(")")
lines.append(
    f"""
TIMEOUT = {timeout}
INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
assert len(CONTENT) == {len(content)}
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={{'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'Base64', 'CommandContent': CONTENT, 'Timeout': int(TIMEOUT), 'InstanceId': [INSTANCE]}})
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
result = {{'name': {name!r}, 'content_len': len(CONTENT), 'invoke_id': invoke_id, 'status': None if out is None else out.get('InvocationStatus'), 'exit': None if out is None else out.get('ExitCode'), 'output': None if out is None else (out.get('Output') or '')[-4000:]}}
"""
)
outp = patch / f"_rs_concat_{name}.py"
outp.write_text("\n".join(lines), encoding="utf-8", newline="\n")
print(outp, "parts", len(parts), "size", outp.stat().st_size)
