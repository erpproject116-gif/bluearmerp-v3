INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
PART = 'fc343448bbc9035143b7f87366b7e82beffd8fbc1b902dca0b3269efb7873714d452dcfb2a3636e3daa346672c99cd8a44ccc1eb5644d86ed7355a33c6a665769a6bb05aaf5be5fa613638750586e93aee445a7eae220afef1c59fcef667f948ea58bc75b79bd78108f70ec77b4754514bef56b36a0b514ca54794cb06fbd6b81a6b56ef2311fa39d5356d8cf5fac18888816e9afbc18acddd7c8b1759143187f2077a642bd60d5d80ed65a222459934c44b372eeddaa0dd476315b431bef54ce39245a266535d93dafe8e870593307a76f8fdb06179ad68621a4607877b1f8666db90b1d863e51efab67853a02d997d0686f68e321995153118644555ada3f0d1eb57e919aec493bca41a8fb41d8afd1166279aaecff6a6a2dede4856dc3377efa2e557cbb53c6d6a595dee9206062f6ad100f9749693ef5152cef731ce255e63bf7af4e6f19fd65efdf0861cdc319299666ea92ae36d5bf0a62b04e47aceb45f1c63889e6975d69647ad69b52c6a9a8bf0aa35cd314eb5a6dd08cf5ad3aecbb13a8db7e05dadc603fc66538bfe89dcd4a2263bf54d8778d9faa6e39cacd3530b9ed6ea29ced18616b39eb70d2c6688b3751a6ec1e3aeb4e0711b5a0d70bbcdad4e4f1a5a0df0bdcdad12649a86eb73c02d862b2bd5528b202fbcd292176ed83181c657da73c54ee32df8e395d6fcb1d3760b4e79a5915376da6cc133afb4e799436b58cf3d07d730c696d6a048848fae459168c32d38ea1886b41d7a336fed0ebd99b776fa68c165afb466b0636d37b1da16755d84d36eea30c67337751863b963fd3531df511046b8ef583f4d7cf8ca628cb8d34d6b967ca5354f1eda8c6db8f3e0966c64cfdd93a799515fb1b5aff53cbadb7c33b7ee365fcba8dbcd13cb8e77a74f67b39745f50cb3aa25dbd2ea12af4cbb1dc7e8077de10eb05887c5b61216dc8f8b31daff42b33cf702fe8a71e5fe3be0adfd879c43f6df7a7c2e160971ab91e766df050bd4708e58be86ff33430d7271f83acc8945de0037856fb4017d943592b15d1b4b6b7e275821cec4048bd77226c11a75ec46b0428887486e170707b79d82b58c41cd64a347a6881b5b079f86c2cda772b08b16276da85edde9199cfe42c761db16a2e75bfd9063a75543b791c327b98d07473a7651a4ee38a9c190e6d381576ea0f454a4965a5ffffd3ba95431b66c967fb71d3328c5e83954a64bee0264eef4c3f31e2677c1b439786aab0b4569538fa655934365a1c92ce696f77b54'
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': "printf '%s' '" + PART + "' >> /tmp/mfg-main.hex\necho C46800", 'Timeout': 120, 'InstanceId': [INSTANCE]})
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
result = {'step': 'C46800', 'part_len': len(PART), 'invoke_id': invoke_id, 'status': None if out is None else out.get('InvocationStatus'), 'exit': None if out is None else out.get('ExitCode'), 'output': None if out is None else (out.get('Output') or '')[-300:]}
