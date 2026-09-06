INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
CONTENT = "cHJpbnRmICclcycgJzRlNmYyMDZmNzA2NTZlMjA2YzY5NmU2NTczMjA3NzY5NzQ2ODIwNjE2ZTIwNjE2Mzc0Njk3NjY1MjA0MjRmNGQyMDZmNmUyMDc0Njg2OTczMjA3MzYxNmM2NTczMjA2ZjcyNjQ2NTcyMmUyMjdkMjkwZDBhMDk3ZDBkMGEwOTY5NjYyMDY1NzI3MjIwM2EzZDIwNzQ3ODJlNDM2ZjZkNmQ2OTc0Mjg2Mzc0NzgyOTNiMjA2NTcyNzIyMDIxM2QyMDZlNjk2YzIwN2IwZDBhMDkwOTcyNjU3NDc1NzI2ZTIwMzAyYzIwNjU3MjcyMGQwYTA5N2QwZDBhMDk1ZjIwM2QyMDYxNzU2NDY5NzQyZTRjNmY2NzI4NjM3NDc4MmMyMDcwNmY2ZjZjMmMyMDc0NzUyZTU0NjU2ZTYxNmU3NDQ5NDQyYzIwNzQ3NTJlNDE3MDcwNTU3MzY1NzI0OTQ0MmMyMDIyNmQ2MTZlNzU2NjYxNjM3NDc1NzI2OTZlNjcyZTc3NmY3MjZiNWY2ZjcyNjQ2NTcyNWY2MzcyNjU2MTc0NjU1ZjY2NzI2ZjZkNWY3MzYxNmM2NTczNWY2ZjcyNjQ2NTcyMjIyYzIwMjI2ZDY2Njc1Zjc3NmY3MjZiNWY2ZjcyNjQ2NTcyMjIyYzIwMjY2NjY5NzI3Mzc0NDk0NDJjMjA2ZTY5NmMyYzIwNmQ2MTcwNWI3Mzc0NzI2OTZlNjc1ZDYxNmU3OTdiMjI3MzYxNmM2NTczNWY2ZjcyNjQ2NTcyNWY2OTY0MjIzYTIwNzM2ZjQ5NDQyYzIwMjI2MzcyNjU2MTc0NjU2NDVmNjM2Zjc1NmU3NDIyM2EyMDYzNzI2NTYxNzQ2NTY0N2QyOTBkMGEwOTcyNjU3NDc1NzI2ZTIwNjY2OTcyNzM3NDQ5NDQyYzIwNmU2OTZjMGQwYTdkMGQwYTBkMGE2Njc1NmU2MzIwNjY2ZjcyNmQ2MTc0NDQ2MTc0NjU0ZTZmNDQ2OTczNzA2YzYxNzkyODY0MjA3NDY5NmQ2NTJlNTQ2OTZkNjUyYzIwNzM2NTcxMjA2OTZlNzQyOTIwNzM3NDcyNjk2ZTY3MjA3YjBkMGEwOTcyNjU3NDc1NzI2ZTIwNjY2ZDc0MmU1MzcwNzI2OTZlNzQ2NjI4MjIyNTMwMzI2NDJmMjUzMDMyNjQyZjI1MzAzNDY0MmQyNTY0MjIyYzIwNjQyZTRkNmY2ZTc0NjgyODI5MmMyMDY0MmU0NDYxNzkyODI5MmMyMDY0MmU1OTY1NjE3MjI4MjkyYzIwNzM2NTcxMjkwZDBhN2QwZDBhJyA+PiAvdG1wL3NsaXAuZ28uaGV4CmVjaG8gT0tfMTE="
TIMEOUT = 120
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'Base64', 'CommandContent': CONTENT, 'Timeout': TIMEOUT, 'InstanceId': [INSTANCE]})
invoke_id = r['InvokeId']
out = None
for _ in range(60):
    await asyncio.sleep(3)
    d = await call_cli(product='Ecs', action='DescribeInvocationResults', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'InvokeId': invoke_id, 'ContentEncoding': 'PlainText'})
    items = d.get('Invocation', {}).get('InvocationResults', {}).get('InvocationResult', [])
    if not items:
        continue
    item = items[0]
    st = item.get('InvocationStatus')
    if st in ('Success', 'Failed', 'PartialFailed', 'Stopped'):
        out = {'status': st, 'exit': item.get('ExitCode'), 'output': (item.get('Output') or '')[-4000:], 'invoke_id': invoke_id}
        break
result = out or {'status': 'Timeout', 'invoke_id': invoke_id}
