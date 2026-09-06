INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
CONTENT = "cHJpbnRmICclcycgJzU3Njk3NDY4Mjg2MTc1NzQ2ODJlNTI2NTcxNzU2OTcyNjU1MDY1NzI2ZDY5NzM3MzY5NmY2ZTI4MjI2ZDYxNmU3NTY2NjE2Mzc0NzU3MjY5NmU2NzJlNzc2ZjcyNmI1ZjZmNzI2NDY1NzI3MzIyMmMyMDYxNzU3NDY4MmU0MTYzNjM2NTczNzM1MjY1NjE2NDI5MjkyZTQ3NjU3NDI4MjIyZjc3NmY3MjZiMmQ2ZjcyNjQ2NTcyNzMyZjdiNjk2NDdkMmY2ZDYxNzQ2NTcyNjk2MTZjMmQ2ZTY1NjU2NDczMjIyYzIwNjc2NTc0NTc2ZjcyNmI0ZjcyNjQ2NTcyNGQ2MTc0NjU3MjY5NjE2YzRlNjU2NTY0NzMyODcwNmY2ZjZjMjkyOTBkMGEwOTA5NmQ3MjJlNTc2OTc0NjgyODYxNzU3NDY4MmU1MjY1NzE3NTY5NzI2NTUwNjU3MjZkNjk3MzczNjk2ZjZlMjgyMjZkNjE2ZTc1NjY2MTYzNzQ3NTcyNjk2ZTY3MmU3NzZmNzI2YjVmNmY3MjY0NjU3MjczMjIyYzIwNjE3NTc0NjgyZTQxNjM2MzY1NzM3MzU3NzI2OTc0NjUyOTI5MmU1MDZmNzM3NDI4MjIyZjc3NmY3MjZiMmQ2ZjcyNjQ2NTcyNzMyMjJjMjA2MzcyNjU2MTc0NjU1NzZmNzI2YjRmNzI2NDY1NzIyODcwNmY2ZjZjMjkyOTBkMGEwOTA5NmQ3MjJlNTc2OTc0NjgyODYxNzU3NDY4MmU1MjY1NzE3NTY5NzI2NTUwNjU3MjZkNjk3MzczNjk2ZjZlMjgyMjZkNjE2ZTc1NjY2MTYzNzQ3NTcyNjk2ZTY3MmU3NzZmNzI2YjVmNmY3MjY0NjU3MjczMjIyYzIwNjE3NTc0NjgyZTQxNjM2MzY1NzM3MzU3NzI2OTc0NjUyOTI5MmU1MDYxNzQ2MzY4MjgyMjJmNzc2ZjcyNmIyZDZmNzI2NDY1NzI3MzJmN2I2OTY0N2QyMjJjMjA3NTcwNjQ2MTc0NjU1NzZmNzI2YjRmNzI2NDY1NzIyODcwNmY2ZjZjMjkyOTBkMGEwOTA5NmQ3MjJlNTc2OTc0NjgyODYxNzU3NDY4MmU1MjY1NzE3NTY5NzI2NTUzNzU2MjZkNjk3NDI4MjI2ZDYxNmU3NTY2NjE2Mzc0NzU3MjY5NmU2NzJlNzc2ZjcyNmI1ZjZmNzI2NDY1NzI3MzVmNzI2NTZjNjU2MTczNjUyMjI5MjkyZTUwNmY3Mzc0MjgyMjJmNzc2ZjcyNmIyZDZmNzI2NDY1NzI3MzJmN2I2OTY0N2QyZjcyNjU2YzY1NjE3MzY1MjIyYzIwNzI2NTZjNjU2MTczNjU1NzZmNzI2YjRmNzI2NDY1NzIyODcwNmY2ZjZjMjkyOTBkMGEwOTA5NmQ3MjJlNTc2OTc0NjgyODYxNzU3NDY4MmU1MjY1NzE3NTY5NzI2NTUzNzU2MjZkNjk3NDI4MjI2ZDYxNmU3NTY2NjE2Mzc0NzU3MjY5NmU2NzJlNzc2ZjcyNmI1ZjZmNzI2NDY1NzI3MzVmNjM2ZjZkNzA2YzY1NzQ2NTIyMjkyOTJlNTA2ZjczNzQyODIyMmY3NzZmNzI2YjJkNmY3MjY0NjU3MjczMmY3YjY5NjQ3ZDJmNjM2ZjZkNzA2YzY1NzQ2NTIyMmMyMDYzNmY2ZDcwNmM2NTc0NjU1NzZmNzI2YjRmNzI2NDY1NzIyODcwNmY2ZjZjMjkyOTBkMGEwOTdkMjkwZDBhN2QwZDBhJyA+PiAvdG1wL3JvdXRlcy5nby5oZXgKZWNobyBPS19SMgo="
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
        out = {'status': st, 'exit': item.get('ExitCode'), 'output': (item.get('Output') or '')[-5000:], 'invoke_id': invoke_id}
        break
result = out or {'status': 'Timeout', 'invoke_id': invoke_id}
