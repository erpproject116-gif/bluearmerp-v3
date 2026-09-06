import pathlib

src = pathlib.Path(__file__).resolve().parent
text = (src / "deploy_mfg_rs.py").read_text(encoding="utf-8")
start = text.index("HEX = '''") + len("HEX = '''")
end = text.index("'''", start)
HEX = text[start:end]
chunk = 1800
part = HEX[chunk : chunk * 2]
script = f"""INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
PART = {part!r}
async def run_shell(script, timeout=120):
    r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={{'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': script, 'Timeout': int(timeout), 'InstanceId': [INSTANCE]}})
    invoke_id = r['InvokeId']
    for _ in range(200):
        await asyncio.sleep(3)
        d = await call_cli(product='Ecs', action='DescribeInvocationResults', version='2014-05-26', region=REGION, params={{'RegionId': REGION, 'InvokeId': invoke_id, 'ContentEncoding': 'PlainText'}})
        items = d.get('Invocation', {{}}).get('InvocationResults', {{}}).get('InvocationResult', [])
        if not items:
            continue
        item = items[0]
        st = item.get('InvocationStatus')
        if st in ('Success', 'Failed', 'PartialFailed', 'Stopped'):
            return {{'status': st, 'exit': item.get('ExitCode'), 'output': (item.get('Output') or '')[-2000:], 'invoke_id': invoke_id}}
    return {{'status': 'Timeout', 'invoke_id': invoke_id}}
out = await run_shell(\"printf '%s' '\" + PART + \"' >> /tmp/mfg-main.hex\\necho C1\")
result = {{'out': out, 'part_len': len(PART)}}
"""
path = src / "_rs_batches" / "mini_c1.py"
path.write_text(script, encoding="utf-8", newline="\n")
print("size", path.stat().st_size)
