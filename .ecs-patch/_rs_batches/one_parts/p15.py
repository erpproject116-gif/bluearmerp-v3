INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
PART = '979da193df445ca22c6369307fd19276ebd49d9e886335a88b999c4894c5e80dfca3dfe14aef02fa406f51b1c848338ea948585cd2ddc177d9bc926eb4d6533cb0959a4c6ae28a4b298059c17d26b6718e684c6915593b2d44b5c495d24c6d2da6193d5c9dd8c66a32fd981c9ca3f4fa0c69305be3b02ffc21442cb5f6367abc1ea795f5b4cb165aae736f3149309c7bb221f3a4935c10c53383845f947428b450ad5d71a078bd330efa322faf06c4d6996f0e478fb89f0ef3257a6cc3bd74001fe1d26bd54ce8a42b6ffc846e34720709fb03ded77b3388866ad419f2faf1b9bc7e0c5e48f75a6cbea55580fea83e7beea1cbf19e7b1c4df553afc1e4765d723b72c36e29a71806a47f1e19615161a08518408773bb5c780ec77a610c6b23bfba38bbba0cb7da9a595d90577d67cc1eeac98fdc0f65200e3a01081131702252cbaf09f54a326739c867c0fec9dc55ac19326e063e2c9d887b0c44db6292093b18e5038c8678b00d24ee37d0cbf6c6907371d288bd88aa913e4bfed84bbaf4d7f3d650c364b122dbf95300f41b70ca71b4e2eaba8099bd0ebcacc50cccf802db2f1172c4c63b87d4d091c1ef6b6816cc8c73db373e36e5a43dafb267fdca21fb005ba4b62f0bf401b7ed4fd699d9b20422cbdeca81d808439e9fa8467837c05cf8aaeb9d8053242e26cf73143878fdd33004160697e061c938ba10fc62b21c01abcdd556d3cd56f8624b311c7143753ece98c446e626658103e39625d7c6c2388465c094b60926e16a21ef4c8c53e427854d7420fcf89368171e0625bbe6bbabcbbfbabac89b2b17ea265f50e87e09639faa71daf9ecf995d327b5164cb13016ee8a02b8bf888522afc440e648e3b2a82022576d8b8dea53efba65164f1df068116666be05608d732d6638a2f3484c203d01a62edd1f67782c5647b0bfd93925f972b1a3c2790e603f2d8cef3cf980a80fafe229a21125e9646474509d91e8ee8add2f9309965bebdbb14903aed663e3662d32201ef330c88160c7862ad71c6de8afc534628143cd75c63254392ff75291937c5b592cb63fe55624c76ac8f67e6d988096343b74331bde81179c11fb653a295456ec3bb42c5d89224218969453b8308b1f6a297946613f7b055bc62f2bdfef1799e8970b7d796392df631b13adbcbeb84e922af60d66d724f415fcc8f882b3f3460e0f458e58ec1efd28c90d6f22014b779092962bca75d184fc34af8e5040903401bdb86a297a3002105263ff100d5172'
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': "printf '%s' '" + PART + "' >> /tmp/mfg-main.hex\necho C27000", 'Timeout': 120, 'InstanceId': [INSTANCE]})
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
result = {'step': 'C27000', 'part_len': len(PART), 'invoke_id': invoke_id, 'status': None if out is None else out.get('InvocationStatus'), 'exit': None if out is None else out.get('ExitCode'), 'output': None if out is None else (out.get('Output') or '')[-300:]}
