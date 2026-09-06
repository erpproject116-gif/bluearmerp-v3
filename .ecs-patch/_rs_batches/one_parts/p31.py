INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
PART = '6a7826f2964557527bed6b3e12eb9625bcd160abc90a7b72cb3d9f94f3830394e626154363c25de4580d30024a22d996d877f23ee75364fb1f03eda2fb48b93bf042cd5e6d98bcb3dc0ad84eddf8eceb27efce9da46f758ceb6debcc2d918c85306663870408acb28e84968082eb7dc119e2a7ea8e534e502ebab8bd14aa8a628ac04e29e99bd8feab6f0ded0184061ad1555b14a5ee6d2204d5d1ac981f1e696d53b827fbc4a8dd3b7d3380b78575a2c82feef6a9a7597c75189d22482dbc15a0576770df30d4e55d39c5ee449b642bc686e79e23869f51044ecc4e1ef8c079f1b35ee070729c4fe6a5cba4f123a68e0988f4c81652f5f3bdcbaec1afd9525c5b3305147daa2563238045e34310cd8b617cad0a72fa750e5e41b3c41f7ca641425ebd21c95b1c9d7424db8cba1af159947d786da88c5c69b51fc5520b7a804b2fd65a52313d1077514d7b5daa4a8b5573d2b558c2c60329908ad8a1860a461a9e8a32029c722425830e73a673867bc71e809ad679d6b9697866b9e5f1a0d641ad3a5bcef6f7ff7b154ab7cb190134dcffdfdfbc7bcfbeffdf5c7f78efeed5fdffe7f8b4baffc7b50744f2eeff69f7be819781ab7abc9011d5066fa4c510124569cf625fc68bd07772076533e0fca164e8fa5f0587fe4f516a9b19db54836769958ebb9dece354dc7a90ed0d09b223730b2f8e19125b04cfa6f25037774d41b765cf5ff93d1f743bf389ddf95672f3a443963ba5977c9e83cdbb406f0f3c7d776c60f84178cfd2dd6c7763bd179e9b7f694f76418b801645238c186af2d7d6c032d4df2d18eae5403474935d0f54ef9eda00743ae310bd1f0168f0f27c6998be7a5d07cc485fb770a4970b50eb7a7641882af5a481eca43825bb73bcb97d299d6a80c1d01702f65df37cc22eb8d50535b0b299bc02a883947daddc4f3a2c75a9b548edc04664c51a8f0fc885863337333dc778d815fb7907c487730bd6e992285ff48ed9c72d60bba3c815d0d1192c437170b19a74ca08bf8210298b0e1ae5c3454fa82debf69ec9ddf2f25eea445d2b0073fd5f4b756b87baf8894678868349e9261047dc0ecf6a068211422da0b51c0a01460a89caac6ef11357df0e36205cd85f208664b1d20cb1389d13d7cc6b5a7ee2b7cbea44009e855db4d51fb17a521a21614777ce015fe42f5a2d73780822662da7b94ba09d32354a3534cf3f224e76cf49712f7258e71a943e9490b15e762c7a539e137116dd98e19bfbc50e83578ddbb3a6'
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': "printf '%s' '" + PART + "' >> /tmp/mfg-main.hex\necho C55800", 'Timeout': 120, 'InstanceId': [INSTANCE]})
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
result = {'step': 'C55800', 'part_len': len(PART), 'invoke_id': invoke_id, 'status': None if out is None else out.get('InvocationStatus'), 'exit': None if out is None else out.get('ExitCode'), 'output': None if out is None else (out.get('Output') or '')[-300:]}
