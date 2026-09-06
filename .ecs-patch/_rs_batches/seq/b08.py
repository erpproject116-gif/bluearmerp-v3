INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'

async def run_shell(script, timeout=120):
    r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': script, 'Timeout': int(timeout), 'InstanceId': [INSTANCE]})
    invoke_id = r['InvokeId']
    for _ in range(200):
        await asyncio.sleep(3)
        d = await call_cli(product='Ecs', action='DescribeInvocationResults', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'InvokeId': invoke_id, 'ContentEncoding': 'PlainText'})
        items = d.get('Invocation', {}).get('InvocationResults', {}).get('InvocationResult', [])
        if not items:
            continue
        item = items[0]
        st = item.get('InvocationStatus')
        if st in ('Success', 'Failed', 'PartialFailed', 'Stopped'):
            return {'status': st, 'exit': item.get('ExitCode'), 'output': (item.get('Output') or '')[-1000:], 'invoke_id': invoke_id}
    return {'status': 'Timeout', 'invoke_id': invoke_id}
outs = []

PART = '6a7826f2964557527bed6b3e12eb9625bcd160abc90a7b72cb3d9f94f3830394e626154363c25de4580d30024a22d996d877f23ee75364fb1f03eda2fb48b93bf042cd5e6d98bcb3dc0ad84eddf8eceb27efce9da46f758ceb6debcc2d918c85306663870408acb28e84968082eb7dc119e2a7ea8e534e502ebab8bd14aa8a628ac04e29e99bd8feab6f0ded0184061ad1555b14a5ee6d2204d5d1ac981f1e696d53b827fbc4a8dd3b7d3380b78575a2c82feef6a9a7597c75189d22482dbc15a0576770df30d4e55d39c5ee449b642bc686e79e23869f51044ecc4e1ef8c079f1b35ee070729c4fe6a5cba4f123a68e0988f4c81652f5f3bdcbaec1afd9525c5b3305147daa2563238045e34310cd8b617cad0a72fa750e5e41b3c41f7ca641425ebd21c95b1c9d7424db8cba1af159947d786da88c5c69b51fc5520b7a804b2fd65a52313d1077514d7b5daa4a8b5573d2b558c2c60329908ad8a1860a461a9e8a32029c722425830e73a673867bc71e809ad679d6b9697866b9e5f1a0d641ad3a5bcef6f7ff7b154ab7cb190134dcffdfdfbc7bcfbeffdf5c7f78efeed5fdffe7f8b4baffc7b50744f2eeff69f7be819781ab7abc9011d5066fa4c510124569cf625fc68bd07772076533e0fca164e8fa5f0587fe4f516a9b19db54836769958ebb9dece354dc7a90ed0d09b223730b2f8e19125b04cfa6f25037774d41b765cf5ff93d1f743bf389ddf95672f3a443963ba5977c9e83cdbb406f0f3c7d776c60f84178cfd2dd6c7763bd179e9b7f694f76418b801645238c186af2d7d6c032d4df2d18eae5403474935d0f54ef9eda00743ae310bd1f0168f0f27c6998be7a5d07cc485fb770a4970b50eb7a7641882af5a481eca43825bb73bcb97d299d6a80c1d01702f65df37cc22eb8d50535b0b299bc02a883947daddc4f3a2c75a9b548edc04664c51a8f0fc885863337333dc778d815fb7907c487730bd6e992285ff48ed9c72d60bba3c815d0d1192c437170b19a74ca08bf8210298b0e1ae5c3454fa82debf69ec9ddf2f25eea445d2b0073fd5f4b756b87baf8894678868349e9261047dc0ecf6a068211422da0b51c0a01460a89caac6ef11357df0e36205cd85f208664b1d20cb1389d13d7cc6b5a7ee2b7cbea44009e855db4d51fb17a521a21614777ce015fe42f5a2d73780822662da7b94ba09d32354a3534cf3f224e76cf49712f7258e71a943e9490b15e762c7a539e137116dd98e19bfbc50e83578ddbb3a6'
outs.append({'step':'C55800', **(await run_shell("printf '%s' '" + PART + "' >> /tmp/mfg-main.hex\necho C55800"))})
PART = '4264876ad304d8a5b6718261d91a376878729f7b8fc647f12b6ed3c6415dcc9678d5724b4486f3b97745d092a26133c48c02627b215edee6828263d15c84c3e218d312c5cf30fb92aa9086240412667e61a97c395bf355b8735c8efaded59da0daaa351d1e1cf01ee31d0a56a57ebe683023f37c50b6814a195c186e2d4cfe3c7b915f69b1ddfde08d2b48b45a71bb007e45315deb19892ca84b76285b1d8f1b1c5b9c94b51aa422621c572e7c701743d2fefcb41d49f347f2b9a959e4f22d80e23e2f5d7b8d66b037c0b337d494fb44c0ecb0a08807918112c0eef793cd7eb2b1be0e00c3e200affb2eb41466c0340869d84da4b217d8a2ca042ff8a2960d8d03f5851d34bcba09ffdefd4f735f071d27df2477c9ba575c7a62b07efdf68ebeae6d359f89998e99cdc6666c3a13454e033dbfdd51334a4ed1cf6b63b36666ea226808080c28675af9e73ffe87eceb00428759db296caef793757b0e9bebf139d08a2049ce270763b47f265456661c7248663ad6346a84c9b88d87f0203ddb3938783eca26553e0c32b431052f6bc810754cbe216968ecee5c3b54f771d566ca5e5c18be1fc04a9435c2408dc1ca54912f0175813febed886bce8d2a683c1d861f38230ba3249e492766f4981b9261101487e9d560c5a2db5fcc012653a72b5f0826303e0695304dd560218ba5d3f0ec03b49d029b58b648111cc8d1fba65acd15d6916986315982a6f017ccf3e1605d4cbc1e9e00270a50b2d14ffef0871ece0aebdb6b2d4d305691f64586a538426b5cdaba80f147bff6ddd8d5e7ea73f5b9fafc2b7ffe7f67f6575900ac0200'
outs.append({'step':'C57600', **(await run_shell("printf '%s' '" + PART + "' >> /tmp/mfg-main.hex\necho C57600"))})
failed=[o for o in outs if o.get('status')!='Success' or o.get('exit') not in (0,'0')]
result={'outs':outs,'ok':len(failed)==0,'failed':failed}