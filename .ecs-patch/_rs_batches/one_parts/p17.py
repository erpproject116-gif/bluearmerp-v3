INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
PART = '7519fcf3b6785954aa3bdfd6ef42b258a7c36136ad1400518230290d173100bca090e59ae0a1ec0f00df470a631e7569310299386a533d7bf992e5eaa6a391b9115677b873da493c64b6bbc998457bceb85cfdb05482918e0cdb3ab9ad32b39b1bbb41f8aec52951c80d32cd766f09c54521694637b712ccc3cf502e8b397796a10c19a28d44bde6de8a39de0202b38c6675800fb821950f889daa5e00d20f2fefc7a556b779b714e42e2438b84fd4ac1b05c98fdc1c11921aab069616099156cc221e561c6db638d2fe2826f3d3a58db7540690a926c6891e008e5803313ae6b60965a3f7d7424a52ec51d20ddf5ee732a4b225f0a9f1a979ca31b27b6340cb3e2569b9714fbe2c26687a48d94c92aed381d35a322a10384700d160ac74c1962884938bdb02db163f9228299b1c5e7b57064192eea0314ad5f573bf28b7049b39f91c09599639612f34118b8d73e18b5eb1ba743fb9aff3afd826e0eeed2f011cf61afded63f84c69ae0ccf223cd62734a597a82f52ef054cc96d0e1d55c457ecf9b9d973a569ffadf0e62f5c13bc25725bd89c38269ec6375f3c2f0e03bd62c4af18f16519f1dccd5ba376935926f2aad4d77accc9acfdc2580c166db81f6f8e7e1a587782c02df460e15ea88cefc19d170b48a38c852f6a64a84892036a1327bb36194e5076190bfd16cf90b398e8a2d93c962247f92285c5170d6d3b314e838b415862b104100b4116924304142e420a590ac3f466b58591cb9741161c2de53aad95466ab7070159a518fa5a6d978bdf29cf79425cf4a8a3e41112d83563dc13a7cdf964243c07171490acd42238e05a1909febfdf6b21eb38bb4140fb32451f98c682728f1579e7d7106f16605a2e43b6c1ee2f47b041910599e7b8bc4208a73929ebc2e44a70398fe01234a7f9ad08306471b2eca50299a378570968b0d22284676014df846dcb961d9775707c977ecc8fe798e85df0dec914bd62c401d10ff6dbfba2842e4172c595e325dd83ecfdeb0b5f0a7ebfbaf46532a86ba09bb4e5983906c52dba148732aae8a2f9cbc3213bbe8ae4a15f9854421f0874d5a7e01675b205baa057178b93f9f13e2c435c9131233b2de69f2b52e9bcf5ccdb9a8120d2d66baaf265edc5cfcbf49c63a017cbfe58e61682f76de4835c7e47b9e938a7c6a736bc92442fa82dbf21bf44945e615a6b9ee94ad37b310c13b781fdf7e596504c05aa3f3bfbb2592635cc3cfb6d334e97a0b4bee29afe3db926d48f5d0acb2470'
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': "printf '%s' '" + PART + "' >> /tmp/mfg-main.hex\necho C30600", 'Timeout': 120, 'InstanceId': [INSTANCE]})
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
result = {'step': 'C30600', 'part_len': len(PART), 'invoke_id': invoke_id, 'status': None if out is None else out.get('InvocationStatus'), 'exit': None if out is None else out.get('ExitCode'), 'output': None if out is None else (out.get('Output') or '')[-300:]}
