import pathlib

patch = pathlib.Path(__file__).resolve().parent
parts = []
for name, timeout in [
    ("mfgpart0.b64", 120),
    ("mfgpart1.b64", 120),
    ("mfgpart2.b64", 120),
    ("mfgpart3.b64", 120),
    ("mfgpart4.b64", 120),
    ("mfgbuild.b64", 900),
]:
    parts.append((timeout, (patch / name).read_text(encoding="utf-8").strip()))

lines = [
    "INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'",
    "REGION = 'ap-southeast-1'",
    "PARTS = [",
]
for timeout, content in parts:
    lines.append(f"  ({timeout!r}, {content!r}),")
lines.append("]")
lines.append(
    """
async def run_one(timeout, content):
    r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'Base64', 'CommandContent': content, 'Timeout': int(timeout), 'InstanceId': [INSTANCE]})
    invoke_id = r['InvokeId']
    for _ in range(200):
        await asyncio.sleep(3)
        d = await call_cli(product='Ecs', action='DescribeInvocationResults', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'InvokeId': invoke_id, 'ContentEncoding': 'PlainText'})
        items = d.get('Invocation', {}).get('InvocationResults', {}).get('InvocationResult', [])
        if not items:
            continue
        item = items[0]
        st = item.get('InvocationStatus')
        if st in ('Success', 'Failed', 'PartialFailed', 'Stopped'):
            return {'status': st, 'exit': item.get('ExitCode'), 'output': (item.get('Output') or '')[-4000:], 'invoke_id': invoke_id}
    return {'status': 'Timeout', 'invoke_id': invoke_id}

outs = []
for timeout, content in PARTS:
    outs.append(await run_one(timeout, content))
result = {'steps': outs}
"""
)
outp = patch / "deploy_mfg_cli_rs.py"
script = "\n".join(lines)
outp.write_text(script, encoding="utf-8", newline="\n")
print("script_len", len(script))
print("out", outp)
