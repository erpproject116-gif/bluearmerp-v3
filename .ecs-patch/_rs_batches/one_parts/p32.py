INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
PART = '4264876ad304d8a5b6718261d91a376878729f7b8fc647f12b6ed3c6415dcc9678d5724b4486f3b97745d092a26133c48c02627b215edee6828263d15c84c3e218d312c5cf30fb92aa9086240412667e61a97c395bf355b8735c8efaded59da0daaa351d1e1cf01ee31d0a56a57ebe683023f37c50b6814a195c186e2d4cfe3c7b915f69b1ddfde08d2b48b45a71bb007e45315deb19892ca84b76285b1d8f1b1c5b9c94b51aa422621c572e7c701743d2fefcb41d49f347f2b9a959e4f22d80e23e2f5d7b8d66b037c0b337d494fb44c0ecb0a08807918112c0eef793cd7eb2b1be0e00c3e200affb2eb41466c0340869d84da4b217d8a2ca042ff8a2960d8d03f5851d34bcba09ffdefd4f735f071d27df2477c9ba575c7a62b07efdf68ebeae6d359f89998e99cdc6666c3a13454e033dbfdd51334a4ed1cf6b63b36666ea226808080c28675af9e73ffe87eceb00428759db296caef793757b0e9bebf139d08a2049ce270763b47f265456661c7248663ad6346a84c9b88d87f0203ddb3938783eca26553e0c32b431052f6bc810754cbe216968ecee5c3b54f771d566ca5e5c18be1fc04a9435c2408dc1ca54912f0175813febed886bce8d2a683c1d861f38230ba3249e492766f4981b9261101487e9d560c5a2db5fcc012653a72b5f0826303e0695304dd560218ba5d3f0ec03b49d029b58b648111cc8d1fba65acd15d6916986315982a6f017ccf3e1605d4cbc1e9e00270a50b2d14ffef0871ece0aebdb6b2d4d305691f64586a538426b5cdaba80f147bff6ddd8d5e7ea73f5b9fafc2b7ffe7f67f6575900ac0200'
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': "printf '%s' '" + PART + "' >> /tmp/mfg-main.hex\necho C57600", 'Timeout': 120, 'InstanceId': [INSTANCE]})
invoke_id = r['InvokeId']
out = None
for _ in range(120):
    await asyncio.sleep(2)
    d = await call_cli(product='Ecs', action='DescribeInvocationResults', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'InvokeId': invoke_id, 'ContentEncoding': 'PlainText'})
    items = d.get('Invocation', {}).get('InvocationResults', {}).get('InvocationResult', [])
    if not items:
        continue
    item = items[0]
    st = item.get('InvocationStatus')
    if st in ('Success', 'Failed', 'PartialFailed', 'Stopped'):
        out = item
        break
result = {'step': 'C57600', 'part_len': len(PART), 'invoke_id': invoke_id, 'status': None if out is None else out.get('InvocationStatus'), 'exit': None if out is None else out.get('ExitCode'), 'output': None if out is None else (out.get('Output') or '')[-300:]}
