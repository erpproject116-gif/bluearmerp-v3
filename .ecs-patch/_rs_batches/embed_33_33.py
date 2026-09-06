INSTANCE='i-t4n5tdhzaktd0x6tc34w'
REGION='ap-southeast-1'
STEPS=[
 (33, 'cHJpbnRmICclcycgJzQyNjQ4NzZhZDMwNGQ4YTViNjcxODI2MWQ5MWEzNzY4Nzg3MjlmN2I4ZmM2NDdmMTJiNmVkM2M2NDE1ZGNjOTY3OGQ1NzI0YjQ0ODZmM2I5Nzc0NWQwOTJhMjYxMzNjNDhjMDI2MjdiMjE1ZWRlZTY4MjgyNjNkMTVjODRjM2UyMThkMzEyYzVjZjMwZmI5MmFhOTA4NjI0MDQxMjY2N2U2MWE5N2MzOTViZjM1NWI4NzM1YzhlZmFkZWQ1OWRhMGRhYWEzNTFkMWUxY2YwMWVlMzFkMGE1NmE1N2ViZTY4MzAyM2YzN2M1MGI2ODE0YTE5NWMxODZlMmQ0Y2ZlM2M3YjkxNWY2OWIxZGRmZGUwOGQyYjQ4YjQ1YTcxYmIwMDdlNDUzMTVkZWIxOTg5MmNhODRiNzYyODViMWQ4ZjFiMWM1YjljOTRiNTFhYTQyMjYyMWM1NzJlN2M3MDE3NDNkMmZlZmNiNDFkNDlmMzQ3ZjJiOWE5NTllNGYyMmQ4MGUyM2UyZjVkN2I4ZDY2YjAzN2MwYjMzN2Q0OTRmYjQ0YzBlY2IwYTA4ODA3OTE4MTEyYzBlZWY3OTNjZDdlYjJiMWJlMGUwMGMzZTIwMGFmZmIyZWI0MTQ2NmMwMzQwODY5ZDg0ZGE0YjIxN2Q4YTJjYTA0MmZmOGEyOTYwZDhkMDNmNTg1MWQzNGJjYmEwOWZmZGVmZDRmNzM1ZjA3MWQyN2RmMjQ3N2M5YmE1NzVjN2E2MmIwN2VmZGY2OGViZWFlNmQzNTlmODk5OThlOTljZGM2NjY2YzNhMTM0NTRlMDMzZGJmZGQ1MTMzNGE0ZWQxY2Y2YjYzYjM2NjY2ZWEyMjY4MDgwODBjMjg2NzVhZjllNzNmZmU4N2VjZWIwMDQyODc1OWRiMjk2Y2FlZjc5Mzc1N2IwZTliZWJmMTM5ZDA4YTIwNDljZTI3MDc2M2I0N2YyNjU0NTY2NjFjNzI0ODY2M2FkNjM0NmE4NGM5Yjg4ZDg3ZjAyMDNkZGIzOTM4NzgzZWNhMjY1NTNlMGMzMmI0MzEwNTJmNmJjODEwNzU0Y2JlMjE2OTY4ZWNlZTVjM2I1NGY3NzFkNTY2Y2E1ZTVjMThiZTFmYzA0YTk0MzVjMjQwOGRjMWNhNTQ5MTJmMDE3NTgxM2ZlYmVkODg2YmNlOGQyYTY4M2MxZDg2MWYzODIzMGJhMzI0OWU0OTI3NjZmNDk4MWI5MjYxMTAxNDg3ZTlkNTYwYzVhMmRiNWZjYzAxMjY1M2E3MmI1ZjA4MjYzMDNlMDY5NTMwNGRkNTYwMjE4YmE1ZDNmMGVjMDNiNDlkMDI5YjU4YjY0ODExMWNjOGQxZmJhNjVhY2QxNWQ2OTE2OTg2MzE1OTgyYTZmMDE3Y2NmM2UxNjA1ZDRjYmMxZTllMDAyNzBhNTBiMmQxNGZmZWYwODcxZWNlMGFlYmRiNmIyZDRkMzA1NjkxZjY0NTg2YTUzODQyNmI1Y2RhYmE4MGYxNDdiZmY2ZGRkOGQ1ZTdlYTczZjViOWZhZmMyYjdmZmU3ZjY3ZjY1NzU5MDBhYzAyMDAnID4+IC90bXAvbWZnLW1haW4uaGV4CmVjaG8gQzU3NjAw', 120),
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
