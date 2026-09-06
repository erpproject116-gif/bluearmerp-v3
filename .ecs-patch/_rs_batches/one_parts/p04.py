INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
PART = 'cb9ec50d7b16b7eb398f59cfa558f5b8463dda6406e96d8079910c1759b110451264f99a70bd496c4ae493a13191216da5d90f5908b26d5843742234471a9aaa7da8ed07594d4e1a18311a6887827ec26882433cf281e56c092539d5a8356375ac58b3f4b66030039b5d196036ec78daf0f5a696353b913662c8ceb2a6ce3e55da97b56c6098bdab6c4661ff9242c8b3ce7da7c48405304ce8fd0830c6c890ac07c5336e3e88c7e378a23ca26de14e9436f680b7c6134133e0aff07f16df1d4f18e7a1a40dfc11a30bf0586c6ff8a2f7b5fc6e6a2a0f17f1cbf8f8dabf3501080ba03eb0040b37c9844b8b184a7227611d4a80e8c1a9366fdd4aac8124df6866932e308be17bbdc5b5433e323220e1223d13fbfd03e7615618049c49e208e59c2c4bb96b3852c7f5785bf44eef85f55c928d413210b370460cd3e89ab9314d8af5d0aaa7ee4e835de340355c91400aaf2b6d00a81fe114259f8a006345397eb306b407239904324f201297a10a6722a3dad20857695608e7880439477958ad8de02dfbd61d08709a01edad72e7b2f562d2794b2004634d750330bf0d010852e5184f44836d2bce1b8d6fbc11a79004941edc36f270ac1fed79e876a35fe85e581b7611d98735dd6d3e0df14cf46a9732d8663dff5acb6d489be6dcb805852d8f7597e7a5395a9c53277c15d120751a3da377d7e008e17373d78a633574c001091664db315886d058ec1e5e8c6cc3df5b0a8b1814ea1414e66caa9b3b5eb2acd85a5d77cac57b7da702c3b2c8eb7a1fff238114bd9a489977d095170809f69e1ccf4b10b2b271313944ed9e7555d2d196c16c87b7b82571f6bf77f36776ada703a1f1ab2b435f432209544087ae35ecdcdf0b1bfad1dc76ff847e5f742d4d9e77a861f930cf6728a51be217699b94f3e1b6c96552b72d7cf4c26def3bf8cb769768cebbd9a266edbbad68db6142c51ebbbd31c769ea47944c3ecc01bf72282f712339a45b7cbc474b27c9dfb25961f71b245ce6a9dbab719ba64ea95c72b34567fbd2c37a6b3b604ca52f3214451565d1235389c11d1c197f31ca4bf3ce5954f2cfd68b4a8a1b354255073d3359133650426edd063e81f7e9471b7ea106be09be809a6cf01127719a0ab4911fcf8fc5c645731254b0651f87c87281906fdef1b98cb30980575c6830359ee84d5c5250e38f404aca5200113095c65181d8d620ce22079c23e741d72ce9e4106567c160fc62183dd7afdb60931881e5754aa3f9f1e6e8275f'
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': "printf '%s' '" + PART + "' >> /tmp/mfg-main.hex\necho C7200", 'Timeout': 120, 'InstanceId': [INSTANCE]})
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
result = {'step': 'C7200', 'part_len': len(PART), 'invoke_id': invoke_id, 'status': None if out is None else out.get('InvocationStatus'), 'exit': None if out is None else out.get('ExitCode'), 'output': None if out is None else (out.get('Output') or '')[-300:]}
