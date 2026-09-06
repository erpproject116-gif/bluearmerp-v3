INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
PART = 'a6f6cca1694f5bae504527a94f20a74fc46a83e5d6914903556a1efa19cec2d34b46059e5b4730d17775deb1dc3e5f4c025d3574b2a5ebc2614af9125c57c9bd1abca2dedd31c7e31d7ac13d752213bd1ef160f73dedb0e4ada9316491bf838ab3d0cbdd9dd0d3d7d691ebbd76b451aa88a7018abe7864cedc5081808247958c2868ac51fa6a16f5da5796c4debcfa6bec0d7511ada6ced420a81ba6fdca2b1013e2d57b4f10572fe2d2b435b2b05c191abcffb65e36d56d34c897aa5c4c46f4de37c879d1f26131cd2b1e92b2bc42211149158a093816506bc5138d5b51d14297884a075882396c4d1dd7db6fcfa66959a211a773a8a43a36565e1d257090aa20b4ab2bd24005a3c59e1ee56334ba212a419149a0cd4931593d9489cc8463009ac217ab9457539e69e40d2b78e66477279187a6746cc7034d9e5fb3e2549d49ee50bbb288a0c23d651083c4bb985722e3141610bfc3841068a90ad1e7968151c55f72ed7ebc94ababb74bfa8af786f75aa3505b2ea4130f0c31a081ae8345bbbe5fc5ca45759076b180d79cf07496ef6b548381c1477465f169460b3568df9c169b1469a6b8dc9450cbdd91129973dc8807f3f1f80cb748fa11d09d87ac9b146c9f50e193341f23b9b4378d340e773934b663943fa7bbc724fba3b88a2de67f1b398095dba7b7965b62293fb1b81e963b8317dad8d13848e1598532869d87bcad617e45f0cbef0423abd825990e4cc1a7a27896236490a51c947425155a4332b67a9c1f8accd620b11f643a2088ed77b13c4bbc4f8f9d48206a2432dc53cba847a592e492001b29a71de31ec969563a1b0cc536bbed729eb703c11c648f118e593c4285d1f312738d004c0e3f0e48a30453287bdac05c0425222c116eb356365dda1c8cddd6290d95e06a7910a3a4624942d9c1412662c248bc212c99a59312fdd1d195d8e0914099b7b895b0aa2765c818e7391d767def044cd10f9e768c09a54d76fc172a33891d1e72666a15eaa74198b956c4bc8b2ea475720199d87ef0e173bc170831a4a66ead38a5fc140602c7d9ec90f2014f567130c2f1e320cf28161b4a9132848c5a1c5355c7ffd101398dd388451827b076081b595e4c890a47380a0e18ac1c653c566a5a31d0f30b016352db07312e81c67777ea5ae51c4d6df336eb13e88715a8ebd0658e6a3bf539a940c74e21b7739fdff2ba0cb1642b91da8dcd6b1ea7b91bc60ec5ba53451aba0d717f4dfd8739c6f0400265dd11c52c27bc61c4'
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': "printf '%s' '" + PART + "' >> /tmp/mfg-main.hex\necho C48600", 'Timeout': 120, 'InstanceId': [INSTANCE]})
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
result = {'step': 'C48600', 'part_len': len(PART), 'invoke_id': invoke_id, 'status': None if out is None else out.get('InvocationStatus'), 'exit': None if out is None else out.get('ExitCode'), 'output': None if out is None else (out.get('Output') or '')[-300:]}
