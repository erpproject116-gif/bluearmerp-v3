INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
PART = '640aa872d2bdb1d1bfb1d9bf71b77fe35effc6fdfe8d07fd1b0ffb37fea37fe30ffd1b70b6ded880f71b5060e32e87382a967325d7586b2f4d42066f40fede9da6a882c0bd2399e55e5d01e47ba5d81ddc6ff4d067861593a470dac66483e19362760c28f7b74c32b4ba5ffcc1fb0db2b8e1370accf4562bef25fbf6f7bfa3e69ebd90adbcd4ba1145366af803d4a3498821dea680ab5d0dc2e245710a671fdb170060d485c389db21458a57979585a29b77efafdfeff43c1ebbc5e1a815db9d47783824a77975242810a955d33172dd6792506b621460b53fdbd1643310b36c3a06ec9317814d244dec7b583c2a7c3ec642dca93492333e582060205c1ce7369754378ac5a159a6278bc1124f6bb28b1abc280e1b7960f8f1683afd01282dfeea58f66942a34bab899d4be20b5f6f21dc6176ec4cb960fe7b6d2d81532121b44500c3eefecf4472b770909405e074960cc7390872096c56d851f9780c250e00d447f412751e031bfa82e3666b8f171842c4c019f1edd340303f49ee5f400778fff6acbe57cd62fac565d297c6f4ff1624c02bc1e48b104c04025f09265782c96f4130a9d2c33e3bcd9f7ecc86212c9248ed4a2165564964512707208b913f00517c11641b98fa9014b20d9cbe27886c03efefc822db200b1871641bc4023604944bb6414c880825db203e44e4926d142b5cd9641be50c219f6ca3b891185387ed09ec370154b651eeba3b65e39e9446ce2d8004f794e1f203daf866e183aa3708201111e352840fe2423899f037053400380bb4f2b47c7470403d777bd8fafa656b2eaff8f42f9a4f175bb31d9fbeb704971ee565254d08f0b2e280bce26597e365f309acb6c5ea98bbe356cc4e90cb41e4382d66eff7e89abb945c8e300988723aa5303eca2749f7f668961e54b7fbb767d07a5a66a3dbbd9e24f12ef1525a149c87829d98d4e2acf531c20db10d389619328cd96408fb6eff2c29a6d924c119898bfb081f639ff404c8c0592f10d683179df575ece0bb2f9b725f38ad11708ad11af8274431e85de789609a6d6a4106ac923ac0d026097948419f025534ca0fab8f897492535300c6e1c358320fc28422190c0620d7f7b04184b66a60c1da5d595d986e14b39e65942a6967b0c90f7c2a7d892882920a0d38340e9555bb3445db3c42a2e987019fb9dce4e731ba3b97cdddb94cee2edce2ee020dee2eccde2e6c6e876fe29669976b9876517669e7324b9347ccc0d04e364a463df5b98195c4d9712e'
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': "printf '%s' '" + PART + "' >> /tmp/mfg-main.hex\necho C5400", 'Timeout': 120, 'InstanceId': [INSTANCE]})
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
result = {'step': 'C5400', 'part_len': len(PART), 'invoke_id': invoke_id, 'status': None if out is None else out.get('InvocationStatus'), 'exit': None if out is None else out.get('ExitCode'), 'output': None if out is None else (out.get('Output') or '')[-300:]}
