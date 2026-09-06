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

out_dir = src / "_rs_batches"
# Continue from part index 2 (C3600+) since RESET+C0+C1800 already on host
# Make smaller batches of 4 parts (~8KB)
batch_size = 4
start_part = 2
bi = 0
for i in range(start_part, len(parts), batch_size):
    sl = parts[i : i + batch_size]
    lines = [
        "INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'",
        "REGION = 'ap-southeast-1'",
        RUNNER,
    ]
    for j, part in enumerate(sl):
        idx = i + j
        off = idx * chunk
        lines.append(f"PART = {part!r}")
        lines.append(
            f"outs.append({{'step':'C{off}', **(await run_shell(\"printf '%s' '\" + PART + \"' >> /tmp/mfg-main.hex\\necho C{off}\"))}})"
        )
    lines.append("result = {'outs': outs}")
    script = "\n".join(lines)
    path = out_dir / f"cont_{bi:02d}.py"
    path.write_text(script, encoding="utf-8", newline="\n")
    print(path.name, "size", path.stat().st_size, "parts", len(sl), "start_idx", i)
    bi += 1

fin_lines = [
    "INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'",
    "REGION = 'ap-southeast-1'",
    RUNNER,
    f"FINISH = {FINISH!r}",
    "outs.append({'step':'FINISH', **(await run_shell(FINISH, timeout=900))})",
    "result = {'outs': outs}",
]
fpath = out_dir / "cont_finish.py"
fpath.write_text("\n".join(fin_lines), encoding="utf-8", newline="\n")
print("finish", fpath.stat().st_size)
