INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
PART = '512158896f8bd119a74475f4c559c35634c6a9d38aceb03a415a53b7c759ddc03e8f6f4b8628ac89367b33dcb9bd41e33b2adc6f8b6d158771fdde0a7718de60f16dd5be95f4637c47252b664f254b6c2b5689b6567453ec8b4d41c8ce3786b71d7429b625626c5d3d5f17e3afda32580e8715649056ea38249ad7c17c324cc67959010e955d94399215297c0c5ec13fbd0499efc19fd2c9689ccd9e61699c723a1e17a7d928d9da06716bfaa300f84fe20fbebf6608c0168ca3b33fd0bffbfa35ed75f69a7e8bd7f3e928453c492b2800afd96f2c0043bf36cb40c29b243881eea918e56bc9e2bf9d01a067fd6496acc8e71fe65959f568e8d7aa793fd9c391a35c3278364382464261773650df7a3d2c39c5524af818bc4a6765f60240055f520016746066d94f2448a8627170506695557b871e75a7247b5cbb767a94cd322c0093abb2498ac8314ab6931b1b28e45c4b678725befdf1a77472f64b351fbca132cf9f7c926f5fe2db4dfc911f24d3c1f7c957d054474c50367e673b017976b03b8545a90eba9d04d630e99a9548f271fe3e4b6edc1c25c52c314b603f3fc8079a95326f7a38611805ff97662e460eb09d4eb3c9a88bbf004c373b77608c77e0af2ef4f2ce1dfcfa494f61b74aab39548579c8dd9dfcfdeff6f37ca2de34ce737fa0a90442f5e6a8d334c8d00802a3c53f653103ce694c382456fd47a80d0f7f92b35105b6d9a2e867d66ed030f880adf179bc13b5b231504c9ccea89f987a7db65ef8dd3d0669175d4b9261918eb3729875d5328acab76ff7fafe3bd118be93b5f7072156d85484a7039bbfe5b575b1fd813926fbc9466f6b8bc8d27fe0c01d3ed5542ae6033356bf457d804083ebebac4956469d75d0465a96d9f1fef88ccf2d7ca4f1c1858f2b5d42b7a4510d2b091e4ebe1314712f3d3cecca276c1643774d10e16f27ffdfff0bffc0b7f100e0b5b585f448bca0a706f80a40fac9643e1ee7075de8f218db4698f6e45ac33f7ae649721b1ec0de1e65b0edcfa01fa9a390ef19b8e793aabbd24b8a936cd6157be100c865329def8ff3e1e0f8e0700fb5aac93ebd1a670755f273013c847c9f4f4e081f4b2022094849886748e37c74a52d0baf3925647431debcc2be32816fd807a2a4ac1ec0dd784308ac3229e6d806a09e6cc2c6ce706d09853de21792310d82504fb651d7ab80ce90a03394d0190f3c7ea169d8631af678ae1ae0e31534f266493f0e67c57c8a6b2ee8894d146c3210d8db72'
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': "printf '%s' '" + PART + "' >> /tmp/mfg-main.hex\necho C1800", 'Timeout': 120, 'InstanceId': [INSTANCE]})
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
result = {'step': 'C1800', 'part_len': len(PART), 'invoke_id': invoke_id, 'status': None if out is None else out.get('InvocationStatus'), 'exit': None if out is None else out.get('ExitCode'), 'output': None if out is None else (out.get('Output') or '')[-300:]}
