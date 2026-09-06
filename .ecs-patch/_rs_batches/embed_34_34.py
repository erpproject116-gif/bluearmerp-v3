INSTANCE='i-t4n5tdhzaktd0x6tc34w'
REGION='ap-southeast-1'
STEPS=[
 (34, 'c2V0IC1lCnh4ZCAtciAtcCAvdG1wL21mZy1tYWluLmhleCA+IC90bXAvbWZnLW1haW4udGd6CmZpbGUgL3RtcC9tZmctbWFpbi50Z3oKcm0gLWYgL3Jvb3QvYmx1ZWFybWVycC12My9hcGkvaW50ZXJuYWwvbW9kdWxlcy9tYW51ZmFjdHVyaW5nL3dvX3NvX2xpbmtfc2xpcC5nbwpta2RpciAtcCAvcm9vdC9ibHVlYXJtZXJwLXYzL2FwaS9pbnRlcm5hbC9wbGF0Zm9ybQp0YXIgLXh6ZiAvdG1wL21mZy1tYWluLnRneiAtQyAvcm9vdC9ibHVlYXJtZXJwLXYzL2FwaQpncmVwIC1uIGZyb20tc2FsZXMtb3JkZXIgL3Jvb3QvYmx1ZWFybWVycC12My9hcGkvaW50ZXJuYWwvbW9kdWxlcy9tYW51ZmFjdHVyaW5nL3JvdXRlcy5nbwpncmVwIC1uIHNhbGVzLW9yZGVyLWxpbmVzIC9yb290L2JsdWVhcm1lcnAtdjMvYXBpL2ludGVybmFsL21vZHVsZXMvbWFudWZhY3R1cmluZy9yb3V0ZXMuZ28KbHMgL3Jvb3QvYmx1ZWFybWVycC12My9hcGkvaW50ZXJuYWwvcGxhdGZvcm0vcHJvY2Vzc3BvbGljeSB8IGhlYWQKZG9ja2VyIGluc3BlY3QgYmx1ZWFybS1hcGkgLS1mb3JtYXQgJ3t7cmFuZ2UgLkNvbmZpZy5FbnZ9fXt7cHJpbnRsbiAufX17e2VuZH19JyA+IC90bXAvYmx1ZWFybS1hcGkuZW52CmNkIC9yb290L2JsdWVhcm1lcnAtdjMvYXBpCmRvY2tlciBidWlsZCAtdCBibHVlYXJtLWFwaTpsYXRlc3QgLgpkb2NrZXIgc3RvcCBibHVlYXJtLWFwaSB8fCB0cnVlCmRvY2tlciBybSBibHVlYXJtLWFwaSB8fCB0cnVlCmRvY2tlciBydW4gLWQgLS1uYW1lIGJsdWVhcm0tYXBpIC0tcmVzdGFydCB1bmxlc3Mtc3RvcHBlZCAtLWVudi1maWxlIC90bXAvYmx1ZWFybS1hcGkuZW52IC1wIDgwODA6ODA4MCBibHVlYXJtLWFwaTpsYXRlc3QKc2xlZXAgNgpkb2NrZXIgcHMgLS1maWx0ZXIgbmFtZT1ibHVlYXJtLWFwaSAtLWZvcm1hdCAne3suTmFtZXN9fSB7ey5TdGF0dXN9fScKY29kZT0kKGN1cmwgLXNTIC1vIC9kZXYvbnVsbCAtdyAnJXtodHRwX2NvZGV9JyAtWCBQT1NUIGh0dHA6Ly8xMjcuMC4wLjE6ODA4MC9hcGkvdjEvbWFudWZhY3R1cmluZy93b3JrLW9yZGVycy9mcm9tLXNhbGVzLW9yZGVyLzEgfHwgdHJ1ZSkKZWNobyBQT1NUX2Zyb21fc289JGNvZGUKY29kZT0kKGN1cmwgLXNTIC1vIC9kZXYvbnVsbCAtdyAnJXtodHRwX2NvZGV9JyBodHRwOi8vMTI3LjAuMC4xOjgwODAvYXBpL3YxL21hbnVmYWN0dXJpbmcvd29yay1vcmRlcnMvc2FsZXMtb3JkZXItbGluZXMvb3BlbiB8fCB0cnVlKQplY2hvIEdFVF9vcGVuPSRjb2RlCmRvY2tlciBleGVjIGJsdWVhcm0tYXBpIHNoIC1jICdncmVwIC1hIC1vIGZyb20tc2FsZXMtb3JkZXIgL3Byb2MvMS9leGUgfCBoZWFkIC0xJwplY2hvIERFUExPWV9ET05F', 900),
]

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
