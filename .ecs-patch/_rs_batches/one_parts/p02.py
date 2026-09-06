INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
PART = '4b524b1a7b6e96aaf1710e42843836c4f1075fdff5cd20fa8a2cf605eeed7effa23b1dece0d71e3f47ee6cf4f411e8d1e857e961b69bff0d47439dc8e374569cc2eb6c36432a4acccbf7f36c76c64ff47ef281da2f0783414fd269ac0007e7241f4b22ad948483a7b359f7b42fd80a712e3c971ac5dd6c06db01de17c8003c4bf331f04155414c54f2edce77e5008e9aced3d7aff79ebf7cf3f4f5cb472fe4312218164df0013d018238f0c1e37151665d399593740690ae84a4a61e5445958e0563898f0e0a59f3254d4d0e1e0bc2d344d6a3df448d1447ac9f1a81d17a25210220a4c67787e94490ad6bb7e0c1e0f9937e425fa40c687ebd24fca05fb6dcd667d55d0d50a002b5c3aa78829cace33ce755b4f0268b7291cc7b44c3609595086366f686ce0ffa159096626fd28fbc5525da4069713824b798c49edca2c515157affe9e3e479907296a52344ca184e32a41458893b692044aa6d813c0a3318ce38c3831a4c49b19dac98a2ac61c469bd9de1471f91acc779402ac19b16556823fcf24997d4e0d8f90b72e308116a4e10079b4810687b426230f2ce6186e24e7b69e733881a488ee5de93d74c42de8005ee0e8ff2c10faf5f90d8415207487b3de47bfac9837bcda4ecafe9381fd13e4150f9e21a360742d6f3c909164cf2d1a0f32948b160bdf42081031a210c2d028b7004981b69a50fad2d436b01019f01f30130e900f2221e2607f85ba3f1cb9d377bcf767e78f9244c5b198a60cb34f0cece5f3a1e260c618354d997860c48a2f751c920f56f0c82501d457920fca74f323c8d67501bcbf406e277f716d60cd191f608812d7094f8f3eececb1852887191b07a22da4570e288ba662065ab9160c1401f04bb8ff6e9fe6d76984ffc4d74b127ba408e3af2193cd2ab8f83d7c578bc9f0edf3b23546babd8df9dbf90ce181fef01a1838ac4b5bc2e4eed7d658982d947207aa51227e4c38d8433e69ab59485040f988fb66f6c10a7ad19ebed1b9bf46004ad08f54a929709ca11e2347ad7273c740f75bec57b824db865e6a496e22b36cd4531d053eb0236aa4124f8ccd0840499a1ea08c6bd3f2f91072fc3a84a7a19c31c9ce9a3beb03804c5006565313e4154fe131ca1d94c721ca5bd30889616b923943f3f457694c35bd8d68010b4db8bcd0d110bc9b7e211b1fb469cca6138b30a2b159e54a7504c630b4e4fab1fb4f2c1533d2421a5816c8b2b025cd19f89f45a7297d522d73bc1e78af74a1226961b4ea687'
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': "printf '%s' '" + PART + "' >> /tmp/mfg-main.hex\necho C3600", 'Timeout': 120, 'InstanceId': [INSTANCE]})
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
result = {'step': 'C3600', 'part_len': len(PART), 'invoke_id': invoke_id, 'status': None if out is None else out.get('InvocationStatus'), 'exit': None if out is None else out.get('ExitCode'), 'output': None if out is None else (out.get('Output') or '')[-300:]}
