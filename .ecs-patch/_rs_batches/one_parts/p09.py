INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
PART = '78a5308533957480042b2b525d0d1dfa0008b7c2c5d09646aafdc1d0781dd23342e03581137056a18fc36d9be0ee825680a0f0a6205bd55061323caaa405bda9c146e49116ac618f0806b33341f3cb380103d43d8202a28723e0fa90218c4c40be8ea341591ff688d179f68986d508906d3326bf81000d770f2c16be3d3484c8e9c5829858b853371896ad036bebfc1aed6a9bac1b82840fb3fc24b3fb8e579e89e2ba6f91a5c1f9fcf893b77dd5414a8a7c279c8a5c498ce1cf9738c06ce127ce70054efe4005f7f40f22429b333c70c6e267e173163fa1b3b605796da6af11589316d605b8053ff728ac059b7bf23641cb3da8ea80e49665b0e11c915b2c1cb9474e5fb11e2e045ca6a289a308f211cd4c444d909ab2bda57b3a1e17a7227872d8dabbadb7672bdf512f2c8b13948559bd5ca6edfd82deb21246ca86732a1cd8b919d635fdcc440715b677e7f26cadf74e15c90af0d5a61cd987d6266a1fc891f4435b3fd2aebbe6493ecedf67c2b676c6a289d8cf79a010f3a607209d88ffe2e6df9d9b9d3b1feec0bfa2c8c40ef6f2f9fd666b86aa9c662796957a099cc863d884888f027f7e9c0e76e1e14f6a0eb2004723fdccdd3d7af2cb3be2aae40c91d02fd77faf5c50bd14d8171515a63e2dec41282f2c1bd6c2b9b39773370efa2c07e3ec08796a990034f0d23d04acfe0312a3a9e97b083b4fcdb8b8e8e68d202c9745de28414b2fe96f32824e2877ef819fbcf702c2ef847d166e96ea51d835c154ed2bf2d03701ace519d313a4f3b7ecb460fc08cfebb0401991e6151c8e9af9518f177253b06ad353da456da2e3f4939c2951dc0ab9a3a25920944e8d87eab7220d4e4d501cd68e9be374897039ae94ca9bf712be2f1d5b27ec7bcba30549d2160ebfc3ead82cb88e2c64b1d80dbeb4cec29927e40cc2eafa4a303595a0d4f559dd74170b0f2430745ba0be7eba7c48201bb2aa7507b06e49d91203f6f5162e2e2295909d3f5b546194e11793ebeafcdec69e59da97e2589c9b0c36f296534838803a5d3423060e99041d9273d0afb39f6cacf79307f79ac9bded65eccb8bd8dc9671bac84783cea72039a7b4de2a0f7d918e0c24ada308a109f0e74eb2261ff322a71260da330c0d03337e6b7cd875e23fbd4d5eeebcd97bb6f3c3cb27e15388610d7640b3e8ecfca5e32147c810ee4bc10f4a20892a0b4b67c6800a8da0ce010ecad3271932ecb82a941b73207e776f61fd704ab5b698822d705cf9f3eececb18b6'
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': "printf '%s' '" + PART + "' >> /tmp/mfg-main.hex\necho C16200", 'Timeout': 120, 'InstanceId': [INSTANCE]})
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
result = {'step': 'C16200', 'part_len': len(PART), 'invoke_id': invoke_id, 'status': None if out is None else out.get('InvocationStatus'), 'exit': None if out is None else out.get('ExitCode'), 'output': None if out is None else (out.get('Output') or '')[-300:]}
