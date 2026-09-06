INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
PART = '16111bfb3b95c5aa383820bd50ec3dbd94dd790284d72bc64633dc9c8d1db8c24ddbd20d8ae6f369381abddd161d902c45efcd8aa94ea7dcf6968d9d5c58f4b2f47dd4960bd453ebc2310f7f8bae903ccee640d5c40e5728c6514b5acc0afb592c30078a9c7d1c6619906859b03b9ccf66429c860180a87b9ace463d8d947e7f174eee04e95d8cd4d9f1b6c8be5d279fd91f0f445c9fc4238762ce7b0238fb635188277964858eb2943249ee2350e05f91c7111a97ef551f02c6f03e4059e1a93163160b745bd412e159a035b1fac27d109ddd51b6da03423b19766fd3c3dbfd442e91b03c173e67bc156dc6de554f352cd081663c1865fb40845793f16008ec7f5e59be3432aeac03a99f8b3972917b9852fe4c026c6c8abb30e3c5f1aee3e70c81f6732680361ed8cd29d0518c5c021f940c800f9e7a56e0a6a698fc78a0ce1cb53ee6b75b36045be8430c8a0157b4c35746b5449e48c937d48d206277a40f0f96e82585dc2481f36ea83c5325d5a0dffc9c53078b77a0d84789738690c42ea5f763a4b27989861f13bccbda1f17c3f7d6f972fe73a5efb22770a0a052ac3acec46bffc061044eebb23ee789b30045477a2400fbe858ac8fa09a8face12e40a6e4ced4f8c23dd9dc4cb77afbb2cdfbb3d9bd3febedabcab5d9b43feb5dbbd89efd39be696bb7acb31f457c95a5b6e08dbb36a94b1a6842ad976084fa9f8bf62f47f925dd0f42297426d880f0f9698bb7605b4dd11d1b9d6f717cae575b356c15a8c8dbba63983adee39d80876343c3c7e5216e2d2bdb29321f8ae2eda307e4e601096b4a70bb394abaf235be53dbf60e524e940cf061afd30f8d78d5ddef1a98714270473366f13919f1758b04a77e22c5d7ad0466f8a91f56d75a344c0bae273a23bd4c5b2ec8bea2f744e709790a032757616bb5cc6e5749d0f5c75fa78da52a03269f476f0a62449946dc6952648a8974b6c41855ba8d2bdd65dda749ff87de9078e9751e0d6083fdd7fdcdf57baefeefe1fac32bfddfe7f8b4d2ff659361817471ede7529808752659b5765455535f037858ac0e8ff235fcffe47ea79d7af0fa79ecc5e6c0e2b8fd2cd8427574ae066619c06d527213a4d7d9610ebcc6ec75314796fc58c8dc12c88affd64661c2506c4dfd565b7095cae519532bf256bb200b1fe503fa310bf1e382179e8912dd4ebc7dbc704716abe42dca0bdd7236780b70e9229406f24ae855363bcecb12ce178cf324034fc946f758a354e7d1101fbf0616'
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': "printf '%s' '" + PART + "' >> /tmp/mfg-main.hex\necho C43200", 'Timeout': 120, 'InstanceId': [INSTANCE]})
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
result = {'step': 'C43200', 'part_len': len(PART), 'invoke_id': invoke_id, 'status': None if out is None else out.get('InvocationStatus'), 'exit': None if out is None else out.get('ExitCode'), 'output': None if out is None else (out.get('Output') or '')[-300:]}
