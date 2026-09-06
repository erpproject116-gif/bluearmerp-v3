INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
PART = 'ec00b93ce1a3aef992e1094d6d2e5df6f5762238d259ffac20438d06708e27fe598edd69677ef15379e75f103d5f0c2e178035e3c9c009b8e1a18d86e932e8421105a6550461c6e97e469e987c18b86cf23d126e2ac27d31753dc766920e05ba2bf227a56028e176edb83cc46e19984d8fea7204c196824cd585c2a8c562c4bdd343921429382980608cf146aad33343c61e9d011f30ef108abb90dc2cb7929b837b07f005a781b364f05738ed4e6671f482c1346d3749d17e69bdf588305cdcdef3d4125fdce6c323ede2a5b028ee7e7ed2c227e8ca58fe3b76985db49815225206dd9a25ac463a132534cb531abd3b975822bb33ce548a94ab62f224a410c560c482adae595e6b7dd5c00ccb72f947c86a78b5ea0e11543f1f8ce7e5512dc7f1ef7d8038a88149aa144e605c7475942469a5052583293ebdfe2ce7ca95eaeadcaaab69812165c45978718a2befc0b577aa6b6b2d0e78365ee96cb47b948d0f5ee407d993f4acfcb5145e972e4a3500ab0d59abe58c2f04441eea79fae8800e5cdd5cb6d3442c6af7a0af506e0b059eba7593ca09eec0c0a374d41946a82b3e5721436a8a7ee24bfbf84228221734a7d0461bfeed9c2f2bd6293c2ed8580a56e500c05fd9376ae9187dcecff8ad9524518f775e3e7bf1fcf19bd8bd8ad940b0f2700e62807a7e115c6798fdf9aeabf1cf25792b9868fa753622dea5ff65fb2d9885ac757af7d39f5c598db4b71a392d7e8b0ef0cb78477f09d7b83ab3ad85b4a27b160474cbc45214a60f54801f5d5bbc80753453d15034cf2d7ecedb0154b49e81759c381a082aa8341056394b3721ca99389cbc6470a8a454b1db4b4241377ff9d4d7406ca19f213e6171dd4c006f96d3ce9cd33c5f84166dc7e650ec2111bb965f3bee2de26cace398b13b8e7eb2de53578d897bc9489794fa8252ca6ff22a46f019ccdd47301bf25e735b321aec7673fbc65d7595b298a8ad2e20c5f4058054ec5d5cedf5c1ba5a0d212f7e2321a56ec6e4c2e83adbb2dcaa2cc7c0ac5009888894c0d5ce525df01296006ebdc09a7c5fb22e80384824e62166c4a3be17455a36ee40682b0435a7a4200789a74570cb61e424b71c8ba6242244b3bd0be534a9e041a14511060559448581de620da867aa080bfebc2522d2e2c6662f79277abb8bf73aa8b3ea402caaaa2d175df7aeb040bcff64a2fa38ac0a45e809c65bb18fd061f531913941d4ce0be5deeccbad224e556150d04bbaba1da25d854cb8190a1416'
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': "printf '%s' '" + PART + "' >> /tmp/mfg-main.hex\necho C21600", 'Timeout': 120, 'InstanceId': [INSTANCE]})
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
result = {'step': 'C21600', 'part_len': len(PART), 'invoke_id': invoke_id, 'status': None if out is None else out.get('InvocationStatus'), 'exit': None if out is None else out.get('ExitCode'), 'output': None if out is None else (out.get('Output') or '')[-300:]}
