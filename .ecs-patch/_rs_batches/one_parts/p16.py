INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
PART = '3b2a4f98942e9a3b780fc92347dd70701e096919a18741082fbf7d833381181d85e374c3058fe56f0287d2c6b1866d3d826f33672be7fac9fbec2c5156f6dd152914310b75a984cbedac9833d4c149ceb437f8635675a19d9e3c504f783c8580213aadc324aee23be1cabcf8014d4dfa26efb726eaa90144480d3b326a7dd88442971fd2ad5884fee6fae6684dfe736fb44af1184783efe0f038420dd068f0045aa62fff95a533fc56927af7f27cddae3efea7d9ff0fef9db37378ff35f8ffc159bf7e77d3f6ffdb78787f7dfdcaffef737c16f7ff9b0c0bf44a5d4353ea9847205090a37f01d740b52774fcc9733af7fdeafe85ae271e4675c6a41c1f55185272fd273bbc6d3858d6b55fcca90854236e174bcac2c7dd61e8310aeccf9fa0fa41384f28b716618722834594b6bf8d6cf74551b98a1096b1c6f1c5b0323e38de0e8e77d007d7bfc7f4e74de285d49d384362ce58ded805ccc4ec91d1f46122bd6f6cf7036d99235c68c618f617abc354ed82437ab557c23bcff924360e029ab740d082989b376435262c116e1720e14e0e1e71cf35df21a752b3733c51627e284f3f4ef3d919a906422e2219bd165291edebf118a7fb36cb0f8fc8776ec5418021e1c929bd776b72b8071c971682bdc2d626c02b583643dd2cd1ebac9c8f2bdeea9228d31e27b50f58a0a071fe0a794c294f26b7ebefb2b2c47326d0e2b178d502c4eda1d10a1c16163b156328ec131817c601d0b584dd42c06b0d3d048cbcfed1b1ce2cf0d921d55c6a3b54af9516436c1e1e5dcd1f94a9a49ddfac386b7535b4ff1b8f9016003dc54b43d589882b1f721a533e63019731531e43732749bc3c60825831ec46dad7e0fa3adeba340a657559b21a2f44e2347f02b206625ae09c62cbf62a3d239f17b6682ca6a618ba7670743fb2332688cb256471921c2adedc44884cb469826d80b81b68a46e7bb7d0a60634863959d19ac7e06af4bc56683b340dc46e45ef10379ed482ede85959f17bf0a30fdd483b4e4c9f7af7cb481b8d7bab650b6ab7f14390304c6db758f5822a58fb4f9f1b8a82370142b6c176a4215b0acdf12c0f9254979099735dc42ec2ddaef79c9cd817654c76ba9831d9af980d7c5f64017745123688ade65cdfd8486d08f4c621630b7cd07fdedd79599352186ff8b0cac01297c2c1e19b8ded1ca90a86f1a84a308e54456623e27db3e72da1c8af91dd5ca4be91dbf502f39a9f8a6b072b8ab68a04674c3a8b599b841ba70da685ce'
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': "printf '%s' '" + PART + "' >> /tmp/mfg-main.hex\necho C28800", 'Timeout': 120, 'InstanceId': [INSTANCE]})
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
result = {'step': 'C28800', 'part_len': len(PART), 'invoke_id': invoke_id, 'status': None if out is None else out.get('InvocationStatus'), 'exit': None if out is None else out.get('ExitCode'), 'output': None if out is None else (out.get('Output') or '')[-300:]}
