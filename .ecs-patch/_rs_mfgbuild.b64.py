CONTENT = 'c2V0IC1lCndjIC1jIC90bXAvbWZnLW1haW4uYjY0CmJhc2U2NCAtZCAvdG1wL21mZy1tYWluLmI2NCA+IC90bXAvbWZnLW1haW4udGd6CmZpbGUgL3RtcC9tZmctbWFpbi50Z3oKcm0gLWYgL3Jvb3QvYmx1ZWFybWVycC12My9hcGkvaW50ZXJuYWwvbW9kdWxlcy9tYW51ZmFjdHVyaW5nL3dvX3NvX2xpbmtfc2xpcC5nbwpta2RpciAtcCAvcm9vdC9ibHVlYXJtZXJwLXYzL2FwaS9pbnRlcm5hbC9wbGF0Zm9ybQp0YXIgLXh6ZiAvdG1wL21mZy1tYWluLnRneiAtQyAvcm9vdC9ibHVlYXJtZXJwLXYzL2FwaQpncmVwIC1uICdmcm9tLXNhbGVzLW9yZGVyXHxzYWxlcy1vcmRlci1saW5lcycgL3Jvb3QvYmx1ZWFybWVycC12My9hcGkvaW50ZXJuYWwvbW9kdWxlcy9tYW51ZmFjdHVyaW5nL3JvdXRlcy5nbwp0ZXN0IC1mIC9yb290L2JsdWVhcm1lcnAtdjMvYXBpL2ludGVybmFsL3BsYXRmb3JtL3Byb2Nlc3Nwb2xpY3kvcHJvY2Vzc3BvbGljeS5nbyAtbyAtbiAiJChscyAvcm9vdC9ibHVlYXJtZXJwLXYzL2FwaS9pbnRlcm5hbC9wbGF0Zm9ybS9wcm9jZXNzcG9saWN5IDI+L2Rldi9udWxsKSIKbHMgL3Jvb3QvYmx1ZWFybWVycC12My9hcGkvaW50ZXJuYWwvcGxhdGZvcm0vcHJvY2Vzc3BvbGljeSB8IGhlYWQKZG9ja2VyIGluc3BlY3QgYmx1ZWFybS1hcGkgLS1mb3JtYXQgJ3t7cmFuZ2UgLkNvbmZpZy5FbnZ9fXt7cHJpbnRsbiAufX17e2VuZH19JyA+IC90bXAvYmx1ZWFybS1hcGkuZW52CmNkIC9yb290L2JsdWVhcm1lcnAtdjMvYXBpCmRvY2tlciBidWlsZCAtdCBibHVlYXJtLWFwaTpsYXRlc3QgLgpkb2NrZXIgc3RvcCBibHVlYXJtLWFwaSB8fCB0cnVlCmRvY2tlciBybSBibHVlYXJtLWFwaSB8fCB0cnVlCmRvY2tlciBydW4gLWQgLS1uYW1lIGJsdWVhcm0tYXBpIC0tcmVzdGFydCB1bmxlc3Mtc3RvcHBlZCAtLWVudi1maWxlIC90bXAvYmx1ZWFybS1hcGkuZW52IC1wIDgwODA6ODA4MCBibHVlYXJtLWFwaTpsYXRlc3QKc2xlZXAgNgpkb2NrZXIgcHMgLS1maWx0ZXIgbmFtZT1ibHVlYXJtLWFwaSAtLWZvcm1hdCAne3suTmFtZXN9fSB7ey5TdGF0dXN9fScKY29kZT0kKGN1cmwgLXNTIC1vIC9kZXYvbnVsbCAtdyAnJXtodHRwX2NvZGV9JyAtWCBQT1NUIGh0dHA6Ly8xMjcuMC4wLjE6ODA4MC9hcGkvdjEvbWFudWZhY3R1cmluZy93b3JrLW9yZGVycy9mcm9tLXNhbGVzLW9yZGVyLzEgfHwgdHJ1ZSkKZWNobyBQT1NUX2Zyb21fc289JGNvZGUKY29kZT0kKGN1cmwgLXNTIC1vIC9kZXYvbnVsbCAtdyAnJXtodHRwX2NvZGV9JyBodHRwOi8vMTI3LjAuMC4xOjgwODAvYXBpL3YxL21hbnVmYWN0dXJpbmcvd29yay1vcmRlcnMvc2FsZXMtb3JkZXItbGluZXMvb3BlbiB8fCB0cnVlKQplY2hvIEdFVF9vcGVuPSRjb2RlCmRvY2tlciBleGVjIGJsdWVhcm0tYXBpIHNoIC1jICdncmVwIC1hIC1vIGZyb20tc2FsZXMtb3JkZXIgL3Byb2MvMS9leGUgfCBoZWFkIC0xJwplY2hvIERFUExPWV9ET05F'
TIMEOUT = 900
INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'Base64', 'CommandContent': CONTENT, 'Timeout': int(TIMEOUT), 'InstanceId': [INSTANCE]})
invoke_id = r['InvokeId']
out = None
for _ in range(200):
    await asyncio.sleep(3)
    d = await call_cli(product='Ecs', action='DescribeInvocationResults', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'InvokeId': invoke_id, 'ContentEncoding': 'PlainText'})
    items = d.get('Invocation', {}).get('InvocationResults', {}).get('InvocationResult', [])
    if not items:
        continue
    item = items[0]
    st = item.get('InvocationStatus')
    if st in ('Success', 'Failed', 'PartialFailed', 'Stopped'):
        out = item
        break
result = {'name': 'mfgbuild.b64', 'invoke_id': invoke_id, 'status': None if out is None else out.get('InvocationStatus'), 'exit': None if out is None else out.get('ExitCode'), 'output': None if out is None else (out.get('Output') or '')[-4000:]}
