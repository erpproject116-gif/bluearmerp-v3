INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': 'rm -f /tmp/mfg-main.hex\necho RESET', 'Timeout': 120, 'InstanceId': [INSTANCE]})
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
