INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
PART = '8fffbdbe7eefae1bfffbe1dd7bf7aee27f7f8e4fabf8df266ef7b54e951feb68d044a674581a71fb1a20514c49fbf4c33c1d3f2bc623511a8ed61108bfcaa350d3207c66b38b4074f091a18e53348d7c925640e8749f5d1cdce04d7e9c596c906c825e924565b7b30928b9babeb1babed909597897bddebf095d6bd8ffb30cb1e052f7ffe6837b0fefb9fbffdec6e6d5feff1c9f56fb5f45f87703fbbb44e1fa6505e7ff2d44c53f2d8449ec6bda32e824caa29dbe2d66ef2968970e4aea042435a6cf2a2ca9aea2e3e43b21d55915192a9f8a234df4c2d9aaf8b9549aecf145dc75329f0e84bfd591d7b18008353b29f19e222f26aa965336d705f658b578e4e3c5621e37453bb6a3a34763a33744448fc643173170a5859d19a253cfb23155f16adf14af66405b87991db1d604acddab8abda928a2eac81aa3245a475690116c8bf96c98eda22259618c0ae7ab16924aec955844e38c13f7fab5349c7fa463293b8d28cbfabdb40a84db269db3aeeb541daa025edd4f6c03c1b40f616fb5dc428befa0c60de46d88f87ef0567689856d5a57050f1ddedaa93095ef754c6b52458d76b3599e8e4b0923aaa88340e3fbbd521460555e143a74b7d387ac322edc80ddf15ee43535ef455489f722abf05e3c82d386de7cb2c83108dadf1527d971367191c94a0de1252bb1b107cb2e866b8d786628968f6336ad32342a52324c9dda10a627d9b84a637838c297545241906ee19d768fe53b131dfdb1082020e8809b3945bcc378d45e246d0d3f7e887e51ee5907f918da11a6c7a43c2209e46d21868aa7ee6bbc4aecce94423170fdbaa0af7c9b60daec480fb92851a3bcd096c07940ca01af2acad998ba25cbd94f6551b9e7b6cc36c2a2f2a92c639da3a239eede218a7d5a38f837f46347ffa68b356b42c937f07c736b8bbefb6fbf86b777c5dbfac8e1e8264dcb3ec00546f4183c43b55c6589903dbbd89b2258c88a427e4f224959497f3f47029da1bb9f346eef0dfe0870501047ffd0b26a1bba5caf49cb80de65150b368e5af782149fc514f1361d3f47a22843c60226f28c103046287beb16ba16317308cbc2af7ed4acb596435f91a6847ee8f1fa30e1d019cecd45f4be8d3322a674df0094be7a8790896f1d76803a5f6cf19641c4616036fb61fc14e42bc566b861b94b989dcd23620dc6f83130709e4e3ed6c36c8e816df97a8a28da8100d165b24f7e00c20d003a1537a05ef1987312d4704df4a8ee82fe47363e865b280b'
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': "printf '%s' '" + PART + "' >> /tmp/mfg-main.hex\necho C10800", 'Timeout': 120, 'InstanceId': [INSTANCE]})
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
result = {'step': 'C10800', 'part_len': len(PART), 'invoke_id': invoke_id, 'status': None if out is None else out.get('InvocationStatus'), 'exit': None if out is None else out.get('ExitCode'), 'output': None if out is None else (out.get('Output') or '')[-300:]}
