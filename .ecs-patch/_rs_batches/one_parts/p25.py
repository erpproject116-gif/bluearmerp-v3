INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
PART = 'a9d71bfc11a489ce1a7ab864953851ba385c117eea82ba7a3bcb812fec0d5ea18b90e86d8a5fddfe3e5989cded01b980445c1ffc49d0c26758fc1773a210e84e4591d71215680cb028b364453eff30cfca4ac2b49aeb1b6b1c361af9abf4493325607575482e7d777d4d211a7a9d754ffba24b9118e787093655ccf2bfa1e162e725c6499da3c1624549a84603bc8f7cfafaf5de0f2f1ffdf0e64f3baf9fff5f4f9f7478baacebca0b7baaf56518256db72ad038818d4b6bc9e683374c5116cb89151bf173b98f7631b2ec8cfce8fafc6a934c2fad1d833b414de3f9cb374f5fbf7cf4223c056163b963ee73bfa3074f27788bff5b9b4c35df941aea466c010efebb7482f41cf5d9f34d40d972e91d0452320d07db795e121e3c1a1d8300844112e99980d8cee904a8977ef84a92c5dd3948172956105c9b84ddce5f10748c7b4b276702bc1d41163b267bd154c446e86056b8639a977ca9e7290b88f506c993d6170a69042028029877fee2fb99b954e1df79d3a32683e09110d9645b00068cc7fee06576fa24c38b9a198cf7db6274d61b88dfdd5b54311ce3418efdaf5a2271565ff3eed0209a36a8f48c7fdedd7939e87c0a8e551873cb3d8134aacd864e0f686de48c7ea090120df5e8c7a3e9f40719ef424cf312a84389c6e74b52873dca420a3cd0e04571b8e084e2f46020626ee010a4b62240316e594dab552140f7027b5eae40074ded0135af1ccbbe844f93fc27fe5ca6fdc77d90f6eebbf2dfbdcd7b57f2dfe7f82c6cffe1cb8242c5445f65cadf7abb909642a112a5c4012d0d4504315a1d672719c6fc3c3ece66430c3778302e4e9343bafee896eff3e9eac12ccfe0e03e537eea654f1991c8f698e588a26149cd87ee2692e41dce7aaba335b81d54df73a37dcfcb467ec80d41d717c6ddd23bc998ab7badedee844753d75a5978cdbca6f40dfeb0ea9a99993a5e7b4fb2717e82971822bc53abf646b28e8e09858d2afb0525ecbd6e9cab36a954ed4e67e1961e49e792455a321e298126fff8fa5b3ae198657c639387b33d712c7a86f2d4c38bec301d9e3d2e8ef7f34936dadd799da1235b5633fd31d5d81bca2ab0d8d01755328bf474023d0eb3c774f9f3822e009a163d1355f6c485d11edd1a5083d238a2c4801aaf8ab2da09ac90dda03221dac3f8167b78e3b257cc826dbdfaeb126d4d4f826d792e686dda12be69c1a1c9855c6c68b25260170790b161bbc0c2d621e3ab50934df8ed34f92c0722a63d7cfe'
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': "printf '%s' '" + PART + "' >> /tmp/mfg-main.hex\necho C45000", 'Timeout': 120, 'InstanceId': [INSTANCE]})
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
result = {'step': 'C45000', 'part_len': len(PART), 'invoke_id': invoke_id, 'status': None if out is None else out.get('InvocationStatus'), 'exit': None if out is None else out.get('ExitCode'), 'output': None if out is None else (out.get('Output') or '')[-300:]}
