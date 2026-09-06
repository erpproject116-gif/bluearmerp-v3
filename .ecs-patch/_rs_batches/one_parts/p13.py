INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
PART = '0a13b66090b0fa10615ea436a426439423898a5c4cd0c78b8ff97801211f978bf87811011f2f3cdee3d2e11e2f28dae3d2c11ee9c46f343c5d2ca6e339423a9e27a2e3b9033a32ebdaed806d2df3acf5ed682f2698dfa586f26b19c86fa9307e8b05f14b168bdfb77cf4be6562f7e1b9136030a548cbe2ccd1d1715dc6b30e44d6ab8bab571f55af6d4cbda6887a72cc24fdc344f8611a89b165c70bebf9dc33014305eaf279eb4f0278fb02df593028acf2a30a73f513c63e4601cf0aea244149d52d1f64b71527663cb5f6fd1c76645e9d0913affd2c39a4c80cb3a4026e3bf95b362b7807e8c449f1c18c25a284153ebd6ec5287700d718f86561c64431250cc0d3626c9c3d786a2cbad410dcc1d46ac4c75a8c49069506df71d594cc42f8ecf0fba1356d63566e4fbe837c32d4eb5c66c2c0c6fc7f7b6581e7d5fbe5d3ff35e4ffbbbbb9b979dfcdffb77eefc155febfcff1593cff1fb2ece5674ffc77794901bfa47c7ed8c01a1c0d69392ca6d9af9f1a1053bc0b8dcd795a71d302aead254f673373f62bdda9389290f6a1dfce51368103249361ad929245201b15f0151594d9c7bcac06d77f8f525eb8c96d21636254ead36e8737a2159c9d9e4e3d322a8620369c1a2d16a9a878ee9103548695fee9cb8fa96e96ac845bea2552e7a50f9c4411fb135d3211f6649dc4b4e8b5d68d8da327e6cb6f026e85c7f28b68622b117f95b80f8bf3a87ce2d600485733200fa5289db0d10af80a3d9aec2929b3d9490e8b26612f671168173901a505e87a9341fd23de7328fdc04914b0fa04c6ee1e95d82c309a2759cf3a694fb281982c9cddb379e6f11a7d00fdb8cc78321adc013697faac98bddde128e185517432cb44f2fd9082d864b54c280512fd655998544a4b962b5226d2b1530b29ad82937ccea48a948a2027f39c523be8d25646cb50699d45ed49560e67f99450408cc84e8e3432ef9d51ed0048eb12b021c875da1e94a0fe9a56cf017d828549063d4941469c0c65a6ace374f69e43ca1ed78cdec712dad9cbbd3bcea70d4bee24f00cadb95cee289a34e1094a752f8b27790904f58caf8b0635140044417b5d2c22c1700002f564a831ccad345305148aa954dad114892a07374f90f818d8a7e218e8adc21bb7d250163088e3e5ff72e1d098f8d3edc3525689b9a4b36ac2b3ceb97d4c4501d545747b2db9bf16dc600beeb0e62de6e4a863a9e24cea2f91e050dc6f98f26e417901d2bc1f17df90753bf21ab7a7a20f'
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': "printf '%s' '" + PART + "' >> /tmp/mfg-main.hex\necho C23400", 'Timeout': 120, 'InstanceId': [INSTANCE]})
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
result = {'step': 'C23400', 'part_len': len(PART), 'invoke_id': invoke_id, 'status': None if out is None else out.get('InvocationStatus'), 'exit': None if out is None else out.get('ExitCode'), 'output': None if out is None else (out.get('Output') or '')[-300:]}
