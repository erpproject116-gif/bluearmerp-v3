"""Build a RunScript that runs remaining hex CallCLI Base64 payloads from local hex_cmds.
Embeds CommandContent strings only (smaller than full aliyun CLI lines).
"""
import base64
import pathlib

src = pathlib.Path(__file__).resolve().parent
cmds = pathlib.Path(
    r"C:/Users/John Ranel/.cursor/projects/c-Users-John-Ranel-Documents-BluearmERP-bluearmerp-v3-github/agent-tools/hex_cmds"
)
# start_idx inclusive, end_idx inclusive (hex cmd file indices)
import sys

start_i = int(sys.argv[1])
end_i = int(sys.argv[2])
contents = []
for i in range(start_i, end_i + 1):
    line = (cmds / f"{i:03d}.cmd").read_text(encoding="utf-8").strip()
    cc = line.split("--CommandContent ", 1)[1]
    timeout = 900 if i == 34 else 120
    contents.append((i, cc, timeout))

lines = [
    "INSTANCE='i-t4n5tdhzaktd0x6tc34w'",
    "REGION='ap-southeast-1'",
    "STEPS=[",
]
for i, cc, timeout in contents:
    lines.append(f" ({i}, {cc!r}, {timeout}),")
lines.append("]")
lines.append(
    """
outs=[]
for i, cc, timeout in STEPS:
    r=await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'Base64', 'CommandContent': cc, 'Timeout': int(timeout), 'InstanceId': [INSTANCE]})
    inv=r['InvokeId']
    item=None
    for _ in range(300):
        await asyncio.sleep(2 if timeout<=120 else 5)
        d=await call_cli(product='Ecs', action='DescribeInvocationResults', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'InvokeId': inv, 'ContentEncoding': 'PlainText'})
        items=d.get('Invocation',{}).get('InvocationResults',{}).get('InvocationResult',[])
        if not items: continue
        st=items[0].get('InvocationStatus')
        if st in ('Success','Failed','PartialFailed','Stopped'):
            item=items[0]; break
    outs.append({'i':i,'invoke_id':inv,'status':None if item is None else item.get('InvocationStatus'),'exit':None if item is None else item.get('ExitCode'),'output':None if item is None else (item.get('Output') or '')[-1500:]})
    if item is None or item.get('InvocationStatus')!='Success' or item.get('ExitCode') not in (0,'0'):
        break
result={'outs':outs,'ok':len(outs)==len(STEPS) and all(o.get('status')=='Success' and o.get('exit') in (0,'0') for o in outs)}
"""
)
out = src / "_rs_batches" / f"embed_{start_i:02d}_{end_i:02d}.py"
out.write_text("\n".join(lines), encoding="utf-8", newline="\n")
print(out.name, out.stat().st_size, "steps", len(contents))
