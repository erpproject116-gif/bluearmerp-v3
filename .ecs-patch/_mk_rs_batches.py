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
print("HEX len", len(HEX), "n parts", len(parts))

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
            return {'status': st, 'exit': item.get('ExitCode'), 'output': (item.get('Output') or '')[-4000:], 'invoke_id': invoke_id}
    return {'status': 'Timeout', 'invoke_id': invoke_id}
outs = []
"""


def mk_script(parts_slice, start_idx, do_reset=False, do_finish=False, finish=""):
    lines = [
        "INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'",
        "REGION = 'ap-southeast-1'",
        RUNNER,
    ]
    if do_reset:
        lines.append(
            "outs.append({'step':'RESET', **(await run_shell('rm -f /tmp/mfg-main.hex\\necho RESET'))})"
        )
    for j, part in enumerate(parts_slice):
        idx = start_idx + j
        lines.append(f"PART = {part!r}")
        lines.append(
            f"outs.append({{'step':'C{idx}', **(await run_shell(\"printf '%s' '\" + PART + \"' >> /tmp/mfg-main.hex\\necho C{idx}\"))}})"
        )
    if do_finish:
        lines.append(f"FINISH = {finish!r}")
        lines.append("outs.append({'step':'FINISH', **(await run_shell(FINISH, timeout=900))})")
    lines.append("result = {'outs': outs}")
    return "\n".join(lines)


out_dir = src / "_rs_batches"
out_dir.mkdir(exist_ok=True)
batch_size = 6
bi = 0
for i in range(0, len(parts), batch_size):
    sl = parts[i : i + batch_size]
    script = mk_script(sl, i, do_reset=(i == 0))
    path = out_dir / f"batch_{bi:02d}.py"
    path.write_text(script, encoding="utf-8", newline="\n")
    print(path.name, "size", path.stat().st_size, "parts", len(sl))
    bi += 1

fin = mk_script([], 0, do_finish=True, finish=FINISH)
fpath = out_dir / "batch_finish.py"
fpath.write_text(fin, encoding="utf-8", newline="\n")
print("finish size", fpath.stat().st_size, "total batches", bi)
