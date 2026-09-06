INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
PART = 'a372cb949d7bf1c88a768e4e7aa46394dba93a5d072959361e135aa3b6f18f1240fbfa9be4f649918f6e5313986ecc209df6b9917806d3506233ce28b400f5a0b729868ad82de6bb34f41590877a673c9a1dc214d5054b1d3db1eb6cbb65f5fa62fbb3e2b47dacd3b8019d4d48ea8ce8f4a2f51dcad1978bd793a42f6c40a78849281865e25116b9d47d1b8c6ae569ee756a9ed628c0f3a30c61aeda9768e9bd67f72eb4f720d2a8578280d104aeffbe450f8c3bd4af1ce923a67e5e8ecbf1995f8b5ff4d920d99fc50359915f2e800172daf3b81f64d0a565fb428c90d56e131744c2013da76ffd846243c34f8c0b7d39dc027fd3c2643cc24988c83864e5aa7439353c05aad27f130c05fbe15ad95e3c7b21220f05790bb2a8dee6eb746eb6030da8b7b6256e31d462a1b324c9bb750b042afbcd37fa66fc030dcc79cf99db0fb6eb445b56bb8d5bc4b908a880e80731f73181de1630a4c02fb7a23a0a44492e3c00611006cfb295eda0a0af84663602b5de548d737cf4e022d8bdb148a27221bc9e1c94cbe889206c4cc237a8c4c2b7194cf275192b56d19e45cf4c1aa829decb90fcee94e77bd2b37ce77b52dcb4b09dc840a6ae61e46c508d3a302597d862d7644bb0d54550e8241b97ca6043bf8bea4db87ff06f8fd36bf2956087453fe151fc122b32df523ce08dfbf0ff03f8ffe182fce0581cb86c4c7d871e7e7e4e915c2f7e436c62f47eb27dd6a1f0255728f299c5f3a1da3c74496a0528f7ae43eb54f47e87b6be3e7a23e077d6ee4ea0a9c3e5ac626243f28d61ce31b6ebfa2e2158149b62b1e944d2f7445c4559ef90f755eff8f514161298bcc5e273e9eb1e7a6faea7b6cc7be7ce8a5f346db965741a1a1b345ba2947323e696c3237e2b6869e396147d87eec2b024bf51d323b4aed9b014b3e796930d1b7b9bc2c06b18d0056c9ca8a4096ba6cac6e29ac1eaeb95e717459c836ae5380cf5451603e19a2cae87ae872fa0285c0db7c4a358901450e059414976c2d80e9d536e1ee7a2c95b84e74f3ef53d70d3a88424474988f0e77f61cec757c3aa86e8b7d8378ab7527b7aefc277b4700fb62254ca7cbbe6c50bcf51782f92674c4a7b3a517840bcb3c3c9a8cb6b479013f29de72f4932debb88cd1af3ede5d3e9b51aafb40190790df18ea75727a3327fcf4b9cc10be39a0ca473c0220af214b6ec793f12b555605c336ef7ed72826079a44d932c3b346ba0a4c9dac543b212e1101b95de7994aa8c91299f4e95'
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': "printf '%s' '" + PART + "' >> /tmp/mfg-main.hex\necho C34200", 'Timeout': 120, 'InstanceId': [INSTANCE]})
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
result = {'step': 'C34200', 'part_len': len(PART), 'invoke_id': invoke_id, 'status': None if out is None else out.get('InvocationStatus'), 'exit': None if out is None else out.get('ExitCode'), 'output': None if out is None else (out.get('Output') or '')[-300:]}
