import base64, pathlib
INSTANCE='i-t4n5tdhzaktd0x6tc34w'
REGION='ap-southeast-1'
MAX_PHASE=12000
CHUNK=3500
root=pathlib.Path(r'c:\Users\John Ranel\Documents\BluearmERP\bluearmerp-v3-github\bluearmerp-v3')
out_dir=pathlib.Path(r'c:\Users\John Ranel\Documents\BluearmERP\bluearmerp-v3-github\bluearmerp-v3\.ecs-patch')

def make_runner(phases, result_expr):
    phase_literals=',\n'.join('"""'+p.replace('"""','\\"\\"\\"')+'"""' for p in phases)
    return f"""INSTANCE = '{INSTANCE}'
REGION = '{REGION}'

async def run_shell(script, timeout=120):
    r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={{'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': script, 'Timeout': int(timeout), 'InstanceId': [INSTANCE]}})
    invoke_id = r['InvokeId']
    for _ in range(300):
        await asyncio.sleep(3)
        d = await call_cli(product='Ecs', action='DescribeInvocationResults', version='2014-05-26', region=REGION, params={{'RegionId': REGION, 'InvokeId': invoke_id, 'ContentEncoding': 'PlainText'}})
        items = d.get('Invocation', {{}}).get('InvocationResults', {{}}).get('InvocationResult', [])
        if not items:
            continue
        item = items[0]
        st = item.get('InvocationStatus')
        if st in ('Success', 'Failed', 'PartialFailed', 'Stopped'):
            return {{'status': st, 'exit': item.get('ExitCode'), 'output': (item.get('output') or item.get('Output') or '')[-12000:]}}
    return {{'status': 'Timeout', 'invoke_id': invoke_id}}

phases = [
{phase_literals}
]
outputs = []
for phase in phases:
    last = await run_shell(phase, timeout=900)
    outputs.append(last)
    if last.get('status') != 'Success':
        result = {{'ok': False, 'outputs': outputs, 'last': last}}
        break
else:
    {result_expr}
"""

def upload_phases(f):
    b64=base64.b64encode((root/f).read_bytes()).decode('ascii')
    dirpath=str(pathlib.Path(f).parent).replace('\\','/')
    parts=[b64[i:i+CHUNK] for i in range(0,len(b64),CHUNK)]
    header=['set -e','cd /root/bluearmerp-v3']
    phases=[]
    cur=[]
    if not phases:
        cur=header+[f'mkdir -p {dirpath}','rm -f /tmp/_upload.b64']
    for part in parts:
        safe=part.replace("'","'\\''")
        line=f"printf '%s' '{safe}' >> /tmp/_upload.b64"
        trial='\n'.join(cur+[line])
        if len(trial)>MAX_PHASE and len(cur)>2:
            phases.append('\n'.join(cur))
            cur=header[:]
        cur.append(line)
    cur.extend([f'base64 -d /tmp/_upload.b64 > {f}','rm -f /tmp/_upload.b64',f'echo UPLOADED_{pathlib.Path(f).name}'])
    phases.append('\n'.join(cur))
    return phases

files=['api/internal/modules/manufacturing/boms.go','api/internal/modules/manufacturing/reports.go','api/internal/modules/manufacturing/work_orders.go']
for f in files:
    slug=pathlib.Path(f).stem
    ph=upload_phases(f)
    body=make_runner(ph, "result = {'ok': True, 'file': '"+f+"', 'outputs': outputs, 'last': outputs[-1]}")
    path=out_dir/f'_deploy_production_split_{slug}.py'
    path.write_text(body,encoding='utf-8',newline='\n')
    lens=[len(p) for p in ph]
    print(path.name, 'phases', len(ph), 'max', max(lens), 'over16k', sum(x>16384 for x in lens))
