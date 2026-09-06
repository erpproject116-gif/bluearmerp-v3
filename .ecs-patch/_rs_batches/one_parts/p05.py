INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
PART = 'a6e800e7dea371ea16c3dbe9da356449f2c93cd3ac931889bd836a7bc71da5fbfba104e8b6dc53bc3fed47ced0823ffebad5508cb7b91e10b5b0564e533875f4b82432c0c826d9618a42b519104304b2c230c7aa3c13f0a97d4a782ca07d8b16e4fce019ea22df7ce47c38ec45c3f209e9d28a14d0132c1c0d07c6b8e7dd728b0339aef19622ab733ff04ef61c905dcc9ce3883c36684ce63a86cfd7dc135d7da8383cc6ffcb8c3ea013bdd6c45d713d83a580a0da8bb35e11fb0fc99185844d973bd9e7d2a19a6fcd0d93b81663cccad0deae3747e656a0d30f5008e3cd34171017b2a4667c8935f478deb9cbed12150f0994aa59e021cd7b4fbe33ce808c55f4ec782e83599cd7b389369f180238b18588d306f237cb7a3eb19f582b7bcdf889a1088ac44a0bf4f8b054240c9eae0fd6e3244f3aedaba7db1601f4fab803c2b6ad2898bb5a827d4fe05e3165d84b8d027b2df4069545b0f402ec3b2a03281ff12cf496e066b995dc3c6560a551b8b0ad217762f851bf0249f3ba82dc09ba4a5acd804e93f48a9ac4e8e3a427113c62c6dfd3421b5185fcce4668aff613a5705240530b58a33362caa2e081b3b696902ae47959ceb367c58c022de1c4e6e85049ea189c1462718e45f0bad7a03aae5af243f11ded803479bb836507d4ea4b6493a6a8114cabe11160e39c4e76525295fc4c8527dd12c500e27da031341539ca26500a88332a14dfeeac09e67b4db05bf298f4c67d4e1509f52f0fdd7e725a301ba1a0a2a49774b5ca445d16320d89d619d8ac90ab3891ecc2992f0078ba0f3a3e81cee12cc42683bebbeb9289c7e13b9a3e6a46d7408260cac8f6aa42b546efbee5441a1a95afcda0e642c92e3799bdd5114d550301252175103a7f6ace3610c83b1d5be52987b49d48a584356ee20fb613e9f42f61ab2160a6c18022da33a5bd299ba1785df523872f1c0147299cfe85d8217448fcf31fff83a68140a550b98eb6e874441f831090cd3a2e78d4f18083d24a5e2c21d5bcf895d176183795d26c2efd8229c82686820a67a34535bb0a507d0917a9d0bd5ea7d40f43cab080d99414161bd9ea1fae4b15dfb3740863116a8cea6800525a57a1ff1a203fd49ed25d9520485bb8c27242c94ad2a5bd9aac99fdd6831fac5d43f8a4763b303c8707f764e613b9c77b09d3bd94a73912375f0be27afd9cf4045118223a58a2f416039cf5e23a5d86a0eed72ac2df0b4b895f3b8af1d567d94f43fcefa36c3c45dba5738500af'
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': "printf '%s' '" + PART + "' >> /tmp/mfg-main.hex\necho C9000", 'Timeout': 120, 'InstanceId': [INSTANCE]})
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
result = {'step': 'C9000', 'part_len': len(PART), 'invoke_id': invoke_id, 'status': None if out is None else out.get('InvocationStatus'), 'exit': None if out is None else out.get('ExitCode'), 'output': None if out is None else (out.get('Output') or '')[-300:]}
