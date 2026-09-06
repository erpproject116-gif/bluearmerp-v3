INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
PART = '744946499abdb7e3929ca98be01b6c9e4fb283143adb3dcac6072ff283ec497a567e56de6a81edfa2b3256bf9a528919a0fe6658aac3ac3266adc630f68aa35a98a31ab2e3d48a9dc7c1da84620b9e3be1101f9740f82f3436a1708740bd940a70d63236a1bd0308e06e8e080a6de69cc64e1ac1537be23a7f6bcfe498a8e51c8291d9e0192ec69b8f26b1ac584d1d864d37d44fbe9517eb3c1edb69613224cb47d20a505b35d6c6b05920db7d30a1bd93501e9b6cca176fa585f792de8bb88b94b9de7be7e6a56fc85e4fbcc642a9d62f2279fa9209d0cd2deaa993b382a2dc5937a682b28592a2435dba1985bf764a7478a032a207ac016e59f7ac7dd59493945c4595715b90e1be9ca7320c326b199fd487acb0927dc378ed9cdfd094743eda96482e1a93088f892ff4aeb49a4506dfb4666d72d9b46bb302a5c526a99c9d29a0583f0bbbbbeb56f40d6d20e3842209d86d88fd7e60bb2bc90024cc38430623c123885efe443e37381e191edc7ea33286f31668f050fa47bbb39f58002a397c2824e71308a5852624ccf8031bc4a0dbb6ab216b948185da35d0d0d6296f0be5beda55142d1483c40fc0c29f743185c87fcffe7bf2df55a7d78bf4437ea18b766235060c49a1dac96db7b07000154a99120c1fa3aa4b3ca3822c668cf80ddcc59ba7df39f9c3ed682ca508bb7517cd017860ad378fe1df50f42d417d754c1695895648106f0be1b1dd2d51944031829c587bc98a8e1443e3c32da94b6c6bd96bc53cfcda8d9164826b8eec307172ac8f4623f413ef0277b6de672d21802a5d838a98d032a1c033ebec3faa03edb34841b72c34ac515f2f739af7e59d55c8251f4efad063e1f86c9dfa65964dd4b6963ca7ded7928717afdf67b54d02005060a021f55870bc726876b418af5c286a36d6de2fdc217b0b2a0ef8837ea2b631bd523f3e090e44ba6140ebc17d6fca2b81463fc083407e95dcaf6e8d6d1751459d1c1de130ad5f283feb6d652d2caf396c559e2a4ee0d5c121b5180f5f04efe98593c431d9c0b032344562eada2f1a7d5458303b1394501bdd4f8a40e85d5b996f997405a2155ad630c6bacbf6b427032f1ee4793bb92d0c196e6bc3174777e180c68fcf0b1c8481826506b3ed9ac1b025ce47b0c84585639b65941ed794a2506eac0756df6095e953bf6e5af9408844fa8764fabf646744e95d64cd263faaf73f05915518188de65358394cda1642db27eaad76009c28d5eed268eb0c4d9dd9d7e51dc008'
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': "printf '%s' '" + PART + "' >> /tmp/mfg-main.hex\necho C32400", 'Timeout': 120, 'InstanceId': [INSTANCE]})
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
result = {'step': 'C32400', 'part_len': len(PART), 'invoke_id': invoke_id, 'status': None if out is None else out.get('InvocationStatus'), 'exit': None if out is None else out.get('ExitCode'), 'output': None if out is None else (out.get('Output') or '')[-300:]}
