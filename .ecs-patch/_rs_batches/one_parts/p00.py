INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
PART = '1f8b0800748a936a0003edbde9721b47b2303a7f35117a87363e2d0005828bb6333ca623642d339a914559944771ae8f836a024db22d100da11ba4381e45ccaffb00374ec4fdf37d4f73df649ee466666d595b770324657986085b04ba6bcdcacacaccca259f54d96c928ed78e8bd17c9c956bc7e9647e900eabf92c9f1caefdee223eebebeb0f1f3e4cf02f7cdcbfe2c7c6fdcd7bf71eaedfdf78702f59dfb87ff7c1c3df25f72fa4f786cfbcacd2190ce5bcedb893fb8d7cf2faf5df2f8ecbc16171be3e001e0f1e3c88adfffd7b1beb0fc4fadfdfd8d88017eb1b0f1edcbbffbbe4dc6bd2e6f36fbefed374f83e3dcc126bd9affffefaeff3e36931ab92eef5df5feb0c0bc0928f5507bf6793613142d4f8b92c26f4e4e058bc394eab23fa32c9aab5a3aa9ad28fb29a41f513f51d6a961d6cff5ae730af8ee6fb836171bc7658ac0e8ff235fcffe47ec779f9330c71b8363dfcd8f00eff4c8b62ec37bf3f9e67e94cff5dcd66d3d593bb6be9345ff3f03f9f9c6493aa989db95db569643a4eab83020aa5f3515e9db30509cd651bc0159857f9f85c8dccb2725a4cca0c1ae92158abb369967c5b1cbfc8275902cb391f56c92fd0c1f32789f58196809027c93bc492ad4e3eea17c779951d4fabb3ce3b288ff55f165679fa2bcb8fe1f5dea4a0a28f0bc0c409acc973a80ffd384d0fd5eb3d6c7f2f1fd9951e17a30c0a0bcc0b540264ce9cb1e9ba2fd3e3daba1378efd4fdbe3ab3e070302e521caeacfb4116fb6192571c642b7252b2d81c5eef7930c34a723af471c6459502d3d91dced2291b9733a4125fefa9817d9b96191f9c03ec7d78bd171e9daaa946e88cced40c0db12a86ef6188af66d9499e9d7a43c4d738c4bda9286057ffc411b30e29cd7418628ac117c71cb26cf86602c5310d5d9597c8515b1e1184ca3fcb277979948d240a874672208b5868cceb89017afdd8f502c0e56d884137b41140eb27d9413a1f572f8a615ae5c504a6b0a22720db1889227b6359c6c710a79110d0bc460263d999235d73369ac218dd5241a5345e8b4aceb6f3e6202b8511dc34c150c59b016f22b018ff9567e3d1ab61152412ba91332cb5371d560ad9de20765b9f20bee126a02a4f3f4eb361958d5477dfe500ee15dd8fac92c9527bbabfbde37ce28cd86b2afdd8b2a9f4a3d3d4f3f2d1b0ca4fec99ecc3899d585bb2dc4ba918d579595459695558d153971526582446c3755d0f609a8ebb75f16cb2bbfcf12775e4b1f3a98c'
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': "printf '%s' '" + PART + "' >> /tmp/mfg-main.hex\necho C0", 'Timeout': 120, 'InstanceId': [INSTANCE]})
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
result = {'step': 'C0', 'part_len': len(PART), 'invoke_id': invoke_id, 'status': None if out is None else out.get('InvocationStatus'), 'exit': None if out is None else out.get('ExitCode'), 'output': None if out is None else (out.get('Output') or '')[-300:]}
