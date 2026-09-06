INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
PART = '7cbb0141d0628708de49de346789808f7d9cb06726582f51dcdb92af567bf0cf20064bd8e36160df6056e9a17d27f9f463365ce04a12e44d686200c766f9e8e080ee0cbab4029eaee9928eaecbe367c5127d21fcac3c0003fc6cd017f58aa16dcfd0b6d8028209acddb38adeb1dda8aeeb6e6b8761cec0286779fe8c1ae1bb7ec3dff49b913d1f243ccb6ed60b63f5d4c463c0bf9cad6b3cb5ebf62efcf339b6ae01817f5315f4e3bedabc8b49a3436e0a1c341096e391139c542fb2c96175c4786844c326799577a3eebe09a01f6df2f16d760807ae07cc0b56fec8c12caafe51c63cd5472003e3f17e3a7cef0c5541f5b4483cab1ea518f414afae400dcdb710a7db184c064d221d8344a9c13c9fbd61d0ba8f5a6e615b2768b60aea6bb2e2d8945bb456a8d33caa0ea072b7a03add02c05fdb06091e281324f8ea1918c1b3178e7e149f390640e209cfade5dbdeec7e595a094548cfad98500d850e2c6d4453731feea1fff946e7bb176e5960a38095d3b42c93677f647dc36831eca51a313c890b2a8d17eb48c41c457cf4527d49e2e5dc9cb7d455c3c829b9f016b24820308ff3bf61c0357cd6c5ab01f95d9863dabe1f5b641ccaf15ece855372c75a8d8bb775c5ccd1e174ba5d5b8f4d8cc46a3137949d4779092b9c1def8fcf14061d1cee665585329c5e3b1d9c00b6784a5bfecd0c48389451459b97d526186df42a4b189ac2e8f49596b8022ce500db5bc561f05e3daf014d54c4224246d67df3a2a8d4b88d0a1a7896727e0cec15b95162b9ac013ef274e16695011a9b3a168e9c2f0d1a152e44ab8ae17ba000d0c88000dbed29d514079184d127913fcb456ad7a12986d56e3983d6e24abfa8cc951bb74931f7fbaa1ce2be74b512cfe5123470029a17085e7b26cc03559dd9b29a1b895fdbeb4ba3c61672947512d7c225a8b367c0b9654147fc0680f42c7c5c1a2302de67c41bc35384bc888915304a0ae18b300aaa8c798087dd645750380648d696b88429d0114716020ed5c0655318d1666200f53beb83f5f5f58de46b679b2e316ccf5990065dce0f0ef2610e8418f193922fd86b513f50ae6f80dd11d336b8fa863092a3c6816d12406cfe6b15303faa67b077c8a6bf43eed223de1e2663d950562dd75c2ab8c0160a6d8c46edc4f9118ecb4f74322cb47286d67e15399780be7aaf82079339c7e1dc189f91eb3ee54258f4f8f64eabd5bab329a40f4132db392df6180322830a7ce6934c4b477b68f3458e1994'
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': "printf '%s' '" + PART + "' >> /tmp/mfg-main.hex\necho C19800", 'Timeout': 120, 'InstanceId': [INSTANCE]})
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
result = {'step': 'C19800', 'part_len': len(PART), 'invoke_id': invoke_id, 'status': None if out is None else out.get('InvocationStatus'), 'exit': None if out is None else out.get('ExitCode'), 'output': None if out is None else (out.get('Output') or '')[-300:]}
