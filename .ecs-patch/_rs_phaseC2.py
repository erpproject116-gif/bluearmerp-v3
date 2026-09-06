INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
CONTENT = "c2V0IC1lCnh4ZCAtciAtcCAvdG1wL3NsaXAuZ28uaGV4ID4gL3Jvb3QvYmx1ZWFybWVycC12My9hcGkvaW50ZXJuYWwvbW9kdWxlcy9tYW51ZmFjdHVyaW5nL3dvX3NvX2xpbmtfc2xpcC5nbwpybSAtZiAvcm9vdC9ibHVlYXJtZXJwLXYzL2FwaS9pbnRlcm5hbC9tb2R1bGVzL21hbnVmYWN0dXJpbmcvd29fc29fbGluay5nbwp3YyAtYyAvcm9vdC9ibHVlYXJtZXJwLXYzL2FwaS9pbnRlcm5hbC9tb2R1bGVzL21hbnVmYWN0dXJpbmcvcm91dGVzLmdvIC9yb290L2JsdWVhcm1lcnAtdjMvYXBpL2ludGVybmFsL21vZHVsZXMvbWFudWZhY3R1cmluZy93b19zb19saW5rX3NsaXAuZ28KZ3JlcCAtbiBmcm9tLXNhbGVzLW9yZGVyIC9yb290L2JsdWVhcm1lcnAtdjMvYXBpL2ludGVybmFsL21vZHVsZXMvbWFudWZhY3R1cmluZy9yb3V0ZXMuZ28KZ3JlcCAtbiBzYWxlcy1vcmRlci1saW5lcyAvcm9vdC9ibHVlYXJtZXJwLXYzL2FwaS9pbnRlcm5hbC9tb2R1bGVzL21hbnVmYWN0dXJpbmcvcm91dGVzLmdvCmRvY2tlciBpbnNwZWN0IGJsdWVhcm0tYXBpIC0tZm9ybWF0ICd7e3JhbmdlIC5Db25maWcuRW52fX17e3ByaW50bG4gLn19e3tlbmR9fScgPiAvdG1wL2JsdWVhcm0tYXBpLmVudgpjZCAvcm9vdC9ibHVlYXJtZXJwLXYzL2FwaQpkb2NrZXIgYnVpbGQgLXQgYmx1ZWFybS1hcGk6bGF0ZXN0IC4KZG9ja2VyIHN0b3AgYmx1ZWFybS1hcGkgfHwgdHJ1ZQpkb2NrZXIgcm0gYmx1ZWFybS1hcGkgfHwgdHJ1ZQpkb2NrZXIgcnVuIC1kIC0tbmFtZSBibHVlYXJtLWFwaSAtLXJlc3RhcnQgdW5sZXNzLXN0b3BwZWQgLS1lbnYtZmlsZSAvdG1wL2JsdWVhcm0tYXBpLmVudiAtcCA4MDgwOjgwODAgYmx1ZWFybS1hcGk6bGF0ZXN0CnNsZWVwIDUKZG9ja2VyIHBzIC0tZmlsdGVyIG5hbWU9Ymx1ZWFybS1hcGkgLS1mb3JtYXQgJ3t7Lk5hbWVzfX0ge3suU3RhdHVzfX0nCmRvY2tlciBleGVjIGJsdWVhcm0tYXBpIHNoIC1jICdncmVwIC1hIC1vIGZyb20tc2FsZXMtb3JkZXIgL3Byb2MvMS9leGUgfCBoZWFkIC0xJwpkb2NrZXIgZXhlYyBibHVlYXJtLWFwaSBzaCAtYyAnZ3JlcCAtYSAtbyBzYWxlcy1vcmRlci1saW5lcyAvcHJvYy8xL2V4ZSB8IGhlYWQgLTEnCmNvZGU9JChjdXJsIC1zUyAtbyAvZGV2L251bGwgLXcgJyV7aHR0cF9jb2RlfScgLVggUE9TVCBodHRwOi8vMTI3LjAuMC4xOjgwODAvYXBpL3YxL21hbnVmYWN0dXJpbmcvd29yay1vcmRlcnMvZnJvbS1zYWxlcy1vcmRlci8xIHx8IHRydWUpCmVjaG8gUE9TVF9mcm9tX3NvPSRjb2RlCmN1cmwgLXNTIC1vIC9kZXYvbnVsbCAtdyAnaGVhbHRoPSV7aHR0cF9jb2RlfScgaHR0cDovLzEyNy4wLjAuMTo4MDgwL2hlYWx0aCB8fCB0cnVlCmVjaG8KZWNobyBTVVJHMl9ET05F"
TIMEOUT = 900
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'Base64', 'CommandContent': CONTENT, 'Timeout': TIMEOUT, 'InstanceId': [INSTANCE]})
invoke_id = r['InvokeId']
out = None
for _ in range(320):
    await asyncio.sleep(3)
    d = await call_cli(product='Ecs', action='DescribeInvocationResults', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'InvokeId': invoke_id, 'ContentEncoding': 'PlainText'})
    items = d.get('Invocation', {}).get('InvocationResults', {}).get('InvocationResult', [])
    if not items:
        continue
    item = items[0]
    st = item.get('InvocationStatus')
    if st in ('Success', 'Failed', 'PartialFailed', 'Stopped'):
        out = {'status': st, 'exit': item.get('ExitCode'), 'output': (item.get('Output') or '')[-8000:], 'invoke_id': invoke_id}
        break
result = out or {'status': 'Timeout', 'invoke_id': invoke_id}
