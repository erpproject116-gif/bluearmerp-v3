import pathlib

src = pathlib.Path(__file__).resolve().parent
text = (src / "deploy_mfg_rs.py").read_text(encoding="utf-8")
start = text.index("HEX = '''") + len("HEX = '''")
end = text.index("'''", start)
HEX = text[start:end]
chunk = 1800
parts = [HEX[i : i + chunk] for i in range(0, len(HEX), chunk)]

RUNNER = """
async def run_shell(script, timeout=120):
    r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': script, 'Timeout': int(timeout), 'InstanceId': [INSTANCE]})
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
            return {'status': st, 'exit': item.get('ExitCode'), 'output': (item.get('Output') or '')[-2000:], 'invoke_id': invoke_id}
    return {'status': 'Timeout', 'invoke_id': invoke_id}
outs = []
"""

# parts 3..6 inclusive
sl = parts[3:7]
lines = ["INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'", "REGION = 'ap-southeast-1'", RUNNER]
for j, part in enumerate(sl):
    idx = 3 + j
    off = idx * chunk
    lines.append(f"PART = {part!r}")
    lines.append(
        f"outs.append({{'step':'C{off}', **(await run_shell(\"printf '%s' '\" + PART + \"' >> /tmp/mfg-main.hex\\necho C{off}\"))}})"
    )
lines.append("failed = [o for o in outs if o.get('status') != 'Success' or o.get('exit') not in (0, '0', None)]")
lines.append("result = {'outs': outs, 'ok': len(failed) == 0, 'failed': failed}")
path = src / "_rs_batches" / "rs_p3_6.py"
path.write_text("\n".join(lines), encoding="utf-8", newline="\n")
print(path, path.stat().st_size)
