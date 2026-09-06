INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
PART = '7d89565b30dfdc78e6967cbf224432b5dbbfc552cad14dc0bd07d09e6507b05ebb3012b9919dd41df45078281e1c24fffcc7ff9653aeede79ffff83f924ae052bd84839c7ac7f420206b24e22e489c10e4104c773c89d4abc1be1ac0c675098cdb1d2c04301dc9fb2c9b120290900854c0223e84048a5c3c569bb60b0dc9bd99086f3c4925ad1dd913115b99410cab06645cd9cf3dfd304fc7cf8a313a31b9167556bb20c17434e1e8f4ea98196d99c8a8239d84e4224902fc9ada43e8493d261020a793ca3d23b73f238a82c1ea12d0f3e1fb35ed6f8dd4915837256f72fab6bb53c67924354c7b17b5016d3355330dc90756430d44cd3afdeb800907909c6b1fc8539f50f295e2e343340d876a20fe8a201e82b61a41b9f6c7d71cc2d4a607e5ee68961e543d3c4d6a19992f0ee0a89a3afdb3c896acd4939e132f1ee7f0ee18b88d6122532bd3c6c761206c30cd853ee00914c8f01d6603e1975977294f5ec094f14b06178007a3e27472384b4700d8b2a03649fb848996b1ddb312d6527623963207610e3d384b4d2bb4b760607e0cf8a99ab238325c82a15f03b9f82aae68f5f157f6f814872cdab704511786fa84fdf3533d036acf9caf2852016e1b40c072a3efb8c1410d52b9ee2e22ba63ba281c14276ad43b05ced13a02eef4d55b4e1ca2ba78b6ca494a181dcf7146996146e51927e13e4876e7fb6821938b58d61a82f5620ed14fc9897c5f9d3d12d9edd575875aeadde7c907643bf7a1e3445a17c10868a99fbcb6563648a0a31db075830efaa66d286ab2d2b795695dafcca8448493f97adbea2d9421bbed924173b85edfcf53d8c1d074f611a96bc920f541bd12210200524c6825f632be4236bb686028998f915a2475069b959aa912b4507f6c58a8a67edcb552adb75eaa168c6ad38ab13e2f63c134c0f47a49419289b046dea8df54f26e434eb6e46ecad2b2ad94bc26b7e9939bda84a001e90fa053915f428f7ac1cdadc26ac099216ae3f1428d29ae5a99d8898a22b0c0e3748c39a7614669951c151368a985bd7f7954ccc7233a94e8f4a42b25845175b633c1348ed476b7cc3281d402a7e5f08108ca29217abea75b1540ffff14617c10b4d2ea49e126c94fe929007e15736423aececb886e2c0e6254af6a7485ef63eb12551c0cf8187e012abd96208433740c62f9e84c363ceaab697c5f09ac1713a6afaad2a3ea85b2d492bb005a6e4fb3385e44b1df8c827c00ea109f4c25acc9523983315bdb6622c9'
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': "printf '%s' '" + PART + "' >> /tmp/mfg-main.hex\necho C54000", 'Timeout': 120, 'InstanceId': [INSTANCE]})
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
result = {'step': 'C54000', 'part_len': len(PART), 'invoke_id': invoke_id, 'status': None if out is None else out.get('InvocationStatus'), 'exit': None if out is None else out.get('ExitCode'), 'output': None if out is None else (out.get('Output') or '')[-300:]}
