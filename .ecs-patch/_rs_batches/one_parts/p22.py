INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
PART = '117c66fc1d7a241dc7aac1b3b44ac7f6f095af220d176a79011f7164df05a2048747178c660c03c18dee0c02381bba71917727c3748aa56810427d178c4d1c1ade23e696e98f4a028cfb6e769efd7115b0ab9f6cf60c5099eba71c64b7c32a25e2bc84f1926fab44df0e53caa3ba112108c2dd86375bde525580087104fb6dab1eec4f1c2fc220c45d574360287a16afa327a3018eaf7093e05fba4f4946e959a9a7823f10621bf70cf4dc5e6e8da433a3015e4d87ccfbd28f288a33fdd60e82f648ba8704668ce1d1603c18658d5c4ab680bc283f10220f9e3debc6ba241cde9b4df1e613addf289e45ef0f7fe82707e9b85451b9be82c23f6eacff447185f1fba6f88e5ffff0879fdca59f4f3420f42533c63080d5ff5f2778bb332adb00e589719b59102e4198b49a35ba04f349e3ece44471fece44b9630fe0f77c3c4a0a8c4d9d4f4880d211ed48d6689afddb20d7ed4f5c6a6f95c202195c0af56a6940e198c033027f6ddcef44b4050a6fa5de52eeea1aee9ff4f9edb61afab54b4e5eefb3ac4e512f3bd850140a0b9b886ac8de8714bd44f361a60fe54c6b5051758b6dc15ae052c037b314bf36ab72f5b9848fe6ffa7e3b402bc3c5e930160a60508db676b17d107f0c30f1f3e8cf2fff483f8ff87ebf7371edc4bd637eedf7ff8e077c9fd8be8bce9f36fceff37ad7f5a55e9f0e818dd469615ff9ae4bf87eb0fefbbf2dfbdbb9b57f2dfe7f828f9cf5a7557fe93a63d1dbaa8e91ce6d5d17c1fedd6d77e86dac3b5e9e1c7b593fb6bd2bddf2fb53f9e67e94cff5dcd66d3d593bb6be9345ff3d1cf20dc472566a25955959817afe5e5c5772506bbb0d3af98523c6863b29f41e319a998f3d931deb15647f07e540ce7587690eca62750b94c7e98c83268a9309f52a0f114f8947106bccf5136514d24fffcc7ff24708c0bef948303f8fdbfe5b8a8f43ffff17f92f9046f25f054d6e639c95a22142dc92e080fd301016b6d2d79520cff92a3b5f60846931f605696548f2e216b91ea280511793ec5652913be2fafff9e0aa8369418ad00874b08efbe9f1715e971954f942a0f20fca0de7544d95d5474934bbe5fb6c47752e3cb4a336f7dafb42cf76a3e1b1ea565a61b66e5a6f29ddd30cc769c67b3e79393221f6676c3f2dd5e2e5e2a6401603e2f1feb757e352b0e6780d8800a0270a74719ace30cc03b95afd6a4ea98ae2992e30cc37b4111037e4094fd0c7146a3c640b2a5a19ebaef718472a4cae040c712d61199'
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': "printf '%s' '" + PART + "' >> /tmp/mfg-main.hex\necho C39600", 'Timeout': 120, 'InstanceId': [INSTANCE]})
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
result = {'step': 'C39600', 'part_len': len(PART), 'invoke_id': invoke_id, 'status': None if out is None else out.get('InvocationStatus'), 'exit': None if out is None else out.get('ExitCode'), 'output': None if out is None else (out.get('Output') or '')[-300:]}
