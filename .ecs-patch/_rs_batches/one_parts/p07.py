INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
PART = 'ce5e97180a089a280bdd4280070f859bd64e0c36c9429d9840b9117d178308468f4e64e4e87f8de8d0c68556bafb9e335434c6c72552ef09ecbf6817e78522477bede8b76561243153456e2671794f1b689178d28c2d955e548cf5544e5d4a0f207fef4a82257cb01cbe9a075d6eebc956e7b0261e736e94f7c0c52659948945f00461862f34946e69307d86a8cfad912d1c033a20886f1316e8124cc8ded6a8a0df72397adbe087a00bf5a1a0cf1fe0d962c36d51fc8a11bf2446bc1d1b1e65c22d050034683fb862af7f1becf5f958549bef5c9ef523bb80d3230a5ae1b441fb860ca26668c6d9ed3a4d256b7e9d5eb29290d9c4664f5858ae2700068f91cd0157cb815015ed0d27956b140bafc703a916a2776e03056a9a067e4d7c4e3ebabc561dc7be24d36af84027889ba523eaebe6b7b6505b96628c2e356759cfef6c8f946f4a91268be974245607e2484c089ce4ac4b70b58a082ed4635f9b862de159ce8fbb6846c87d96711a726d9ae600c55a4f60ac2630be90093870af05b8adba94c6bb7a87df866f87d9e8769b89105e8a0804d5e75989da55300ad673cf6aac6655b73c57224d3b91461dd81727d47897284b8b355e4b17259ff88247a358804fd875889d29865d7a282187dd6af8896eecb2fc6ec26ad715943eabf8d18418be00f2790504eb76e54a4c682d26b04b90b898c00a0931a13c1ef08aa29451a40b2d7cc7d3ad5f736e68b6a825fbd97252c23b68272025c0d35976400de3c962f34ce28491c5cc74943081462470141d4fabbf450a7e9d74955c91dc11b1b84e80a0ddde4846e9d9eddebb8b9035a0e14eb2bebe45ffdd595fef2c2f7c346acced6bc473eacc25e82f5d5d0efd4859242892780cfe829175da6bb96120faa6d248392e7ef76d1c5a4c518d5a61b2d7de536d02df2ef2c4b9ca6a5b344016e954aa7ecdc2488991ef1bbe8dbc76c301787001965765436d57951de6d5ecad2778355afb7f2f5e4d98fbebe5bf48e5b36d9e700eedb3dd501b2ecd67ce82ec1aaf61ab7ddbab7bc9cc4016e3b604f2913618f80cec55cbb5fcbcac95b45671d8126eaca2ceab449b37cb876fd0ae893d74aca303bc8ecb5375bd8e034c49af45900fa49abbd5acb5b60dcff03dacd4216ead2a16ae5c15a2aaf4aec2fa5eb40fd38b70a4afd2199032641f224139c438c2ed4087d4ca5374b1ae6923ee76ef015bc6d252bef8385243f3b481bb9c5ec4e329385315c9171f0f120c6dfb5ff059fdeebbd5'
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': "printf '%s' '" + PART + "' >> /tmp/mfg-main.hex\necho C12600", 'Timeout': 120, 'InstanceId': [INSTANCE]})
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
result = {'step': 'C12600', 'part_len': len(PART), 'invoke_id': invoke_id, 'status': None if out is None else out.get('InvocationStatus'), 'exit': None if out is None else out.get('ExitCode'), 'output': None if out is None else (out.get('Output') or '')[-300:]}
