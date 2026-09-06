INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
PART = '0d0683c547caa401e7be542cc69b8ffe129639a62b9a24d9c7bc249b60764d6e2fe59b8fe1c5846778c7ffe6e305aee158afa1e8157bf97c6b587dfcf25650c4271457ded37456c222625cc104830d8a9d48efd492b1e2dd597a2ac21ebe4e4f6520715c057ce7d9a14c75cc4418f8389b60e51e6a75ecec40537e51cf232bfe303986c11da563acd84f6e4d637687344a77995b21573bdb726b0dff152ccb61425776e55776e55776e55776e5bf11bb7264c480e540221f31cbab673f92aeb4bd2343f29496d8e46713ad5fc8a931bd34be2362dad940cd7ff3769dd3a05167cc3650cdb5d640701ab20d9c1a26e977cdf15f652a99ecf2f27f6c3c78f8f08197ff6373fd2afeebe7f8b48aff6ac2baeabcbf3d2711d11320a64322ca22bd50998ce849b2fb5c98dcdb8e9652235026bb3babe37cf21e30596853982fa5df344b4304e7dbeece0baa09ff664428ea33c23ba69ed11c446ecbe182d12c4458ba4339c3309cb918bb507390d9f3282f25653b4bce8ab96bac3f485e0231de4a86646f0f22a7b8dea6933ce9163361b6bd3bcea7c93fffefffc77a0bb43f0521e8540232eb0d3a5c53ccd6ca30188f453772c560274c46e9b88049038068d58c16382fd5a28ddc0572db63cb54c2148786cfd559feda2f95b1fc8dae98df89a4c2b76e252bfecb6f1cb9aceda28a968c621ca3b6c1123f0a0349c643172b89d34b2516908e51ad73310520ebc195323fe7e4209f1d43056c58a6a08e2ea6c5ec45d7f3955ccf57afeb1632d0165bcb29e389b3b26ab996be69703cfb97d7015b47ffe5b2eb68e9b5a129bd8e5a572e5f342ca72eeeafa8b6bf94a32dfbc8cb4d9cdd0bb0288403c5ab9dc6f5952d3d2b66b096d359769217f3727c6606080ca1d0f2a26bdf6b49748f321151f0f5aad6002b3fa8144dfd073042728fda3263a6d52f017a6730694989045325d4621389a0f0702d5119f35ebdc6c8dbe931a0eb18f8d2fd7c9c57e44f0fdfc65880577bb553f662b8c7e7c9916f561cc279518a840a262fa89cf1a32a596109bec30889a912a6eaafd59e7c685abbeee58bb329a82d3be139b14bd4c11c6ca9caa37c581423c42371c3852703ae7a86523ab5a9ae1314dd1645d4f2257f7cbd2a506f55bd57728076c51a0040578b0920039d3bd42a9e35b30c33ab12ee0ed339ac2cb477261d6fa86d1a14ba9f023cb3a947d66393b48fe13fbe6e7900b7b09efffbdf598bcbec6d02b6ba4ea4d49d7277bf39c244b7c5ec'
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': "printf '%s' '" + PART + "' >> /tmp/mfg-main.hex\necho C52200", 'Timeout': 120, 'InstanceId': [INSTANCE]})
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
result = {'step': 'C52200', 'part_len': len(PART), 'invoke_id': invoke_id, 'status': None if out is None else out.get('InvocationStatus'), 'exit': None if out is None else out.get('ExitCode'), 'output': None if out is None else (out.get('Output') or '')[-300:]}
