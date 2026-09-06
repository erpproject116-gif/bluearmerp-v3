INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
PART = '4ee45ab1e45ed0f648eaad8cb4151029b44d873c787ffc89b7582fc995895b367c8694e40c7a4bc9c1c0b9b7660de5a8b474277ec39279b29d78b3a0686705415a40c2939d0505bc59363c79649c885eaac389dc6bd319887bd5193912692578d8e2dde51055ddbdd17c26ceaf636a0539464fd0135ea7ae5461f37bf660cc1877ab745639265aa74f27e449a5eac04ff4951755bb62cafd24d022ac8e3369630c287b42b3126ac095914b66302bd6cbe09e949f0d6e3788c6012b242f894a5789b1cc16c9cd5f818648ca71d5f554260f03b54a98129a81642f4377779867969f10df222af492906512979b8595d2d696b078baf1407f7bb8b5854b04fd1c4fabbf590ef2ca6a493cf38f7fb313ed63542c08fc85e5edab0671652ce7bed5f58d5574efbbd3493636b7d6d7e1bf3bebeb1d85566d45d730fb837c81da8f37cbade4e669c71e2fb4c745f5cb1279d54a75a4b02be4de2f51e45d48e2a5694dabf6326f4c1762b3f1e16b075b0b822b0bc7a14794f0745850d1f18508e28e79fab9ee2d2e48f836acaf257e9bc76d057013c5661939dc70798b49e211df00cbecf33216232c905f8e20ee18cf4ad9dc62ca02c2799df1b4cf71511f22a23d79259088774bd46f29c6d7e94023872913e413e59d173a4ad50af3f3930be0de72478e4963c02b6fae79c2a8961d8b9aa3426a149066c991db2a08677e03fef60e8c77389e8fb2117fdc97edb0b9403b9acee82a9645b3db0d7bd9530dfaba0f79d287ce89ca3de399c5f22222c8051e580bea1bea8eacf6785b775ed1ad73bbc3aac97abbbd0224cc4913d798e80dde4f8eb5a4108a8b20dfd6c43fc804df4eedf2b0074676b8ee853c803a3ae8017ed7610ff0c742810f7e77f5f937f8e432d2d6da71319a03755bb362d2ade99d5c81b032382c96ea037896070f1e24f8173eeedff57bebf7ef261bf737efddbbbfb1b1012fd637d7efdfbbfbbb64fd82e71afccc717bc150cedb8e3bb9dfc8679a0edfa34f8ab5ec48e8f2e36901e40c79810e2e3e3ceed0772018f0c5843a7b032f5f068275a01a42d41bbc112c14fe24bd002aaa8cb62b47bb4920a78689fa44cf7fe924c9ee4be477138cee465f3b648d0eaff089feb1fb7275737df301c6f51125e9674759ae2b9d44c5bc78c5587e91a7c16151c5628e54c81fc1f98545e0c0809f3456716818d63b54f5e6871e9c3d373fc8e9ddfc80a177b0b93eb6d6576d71d3b14f31b00a17431fa6c1c18bc200be173b6f56'
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': "printf '%s' '" + PART + "' >> /tmp/mfg-main.hex\necho C37800", 'Timeout': 120, 'InstanceId': [INSTANCE]})
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
result = {'step': 'C37800', 'part_len': len(PART), 'invoke_id': invoke_id, 'status': None if out is None else out.get('InvocationStatus'), 'exit': None if out is None else out.get('ExitCode'), 'output': None if out is None else (out.get('Output') or '')[-300:]}
