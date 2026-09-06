INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
PART = '274ff458ab22d01941a0b92b058c561d9d0b28b42a836f3320830214bde69551411b5051314bd2834adce7c8c51f38be05fe08d48edb4ac49288cdb60503d163fb17f10e68b2ff2fd009f77ce6ff4dfe3f0fee3f5c77edff37efae5fd9ff7f8e4f2bfb7f66277f58ac0e8ff235fcffe4be6b447f7906ffc6dde8757698a3bbea6bc24c38d130343afd988998d1aefe81d40da244b763a337ca76a88138e6ad48f2723c1bbc85317749cff05a90f957d9ec382f4b5402f8c1a731aa02157e341c92d22c1df5e479b5265f2343f92d7c253d89d0525c78376bbfe4a34f5086a5ebbd989e482f035dbd2a4a36253b17ec05f7846efbceb4ec345417db9f0801ee7468e70a50797f16eb92c98635ab87a55645a9353212123f5629f6c31a86939728b4035f8d8dc1ee389f52909e67c5ecedced260597c8c38a2556fa0c1315ee6f81cbce423c4c39b8f70ed97b2784eab2ad0568b3a78d69bd17ece9596e0d223599e362cbe808652e8ee3f73ef408e2bd2c5afa24b7fe90ce63bf912e3787c6eb8ac952031afca481eceb85098564a88cf88ce3eda5e62ef92f406d04550e0cf31067f43d3cad085f2aaf22ee98ba0306671c4f35f6b5878c1ea8de9053cfcfc031257be0a506b1404a7d317c170f4d0ac0bb15f6d8c08b5da01b680e0ee7c1f1329c547b627cded3a35e35145faca36af2d9e37f7aeacf9eabad7658c71a83f80cb2281d2d79b8d6a55b97334b8e85c1e59566352b7a1ee5002668a973f185223ae6a35a20f9ec8cd288decd3971559a041fe6780595e09502fffc3abfb1bb6fcbfb9be79fffe95fcff393eade47fc506e1f76c322c46881ae8d3474f62d101303e52cb48019f49aba0705c079e3a571400ca5b75ce16be846806405b91d44d8b713e3c1f44827111345d8cfadfb6f2c2d551109abd6bbfa510b4758d0b2fa2488082588402c7e7dd8f55100b56e05474428a0786e745150f473b680e7750d3b31c7b63e48348132a72594d1326d66d6028268b516c8db83b6138fa42ad97b3d39f1f8861a9480ccda118bc901a353104fc781d0d013b2861928dd94ea005caecd518d841d75a26b48357391edce1da233851d0ec45c69ba4da0e08532ab2974f54ea35bb05aa0becffb72815086c597149c544c50e20d101ad65dd36dcd8251acef5d14b4c450d7977f2ac6208f6b2853af0e5aa880f3ed79f48ee160980786c0f0f026e43a890d399556a1aa240b36e6be6da9a6b68286c2b23f16e207867d1fc80efef'
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': "printf '%s' '" + PART + "' >> /tmp/mfg-main.hex\necho C14400", 'Timeout': 120, 'InstanceId': [INSTANCE]})
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
result = {'step': 'C14400', 'part_len': len(PART), 'invoke_id': invoke_id, 'status': None if out is None else out.get('InvocationStatus'), 'exit': None if out is None else out.get('ExitCode'), 'output': None if out is None else (out.get('Output') or '')[-300:]}
