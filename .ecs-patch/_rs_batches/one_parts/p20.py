INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
PART = '412265875cc5c2164af03202c6d41e073a1511d95018575e9ffa6969e2339e2c415362f24c1baa22e58f0ba22bfefdbc62bf2394a596b47c19b42530a72871f952a94bd31c1879b910fae213187f047da7a42231bca4a12f3e81e1e50c75a9252f8bd097d604a61585694162048da1fd2838a57360bf7387528b3a015da890782486e0ba5b8ee1bd36635b10cfb92ae082466b70da180579222826af981f676f05be2c6359696723e3d155a0b32c1b319ad64fe664b5ade4541248e51dc492a29a6d4f96b790ce8c8488f14342f88f7ab7af3c64b71a41b320b2a83de892fb027a03e5c65d215b25a7858cc286e831c93e835d52e308aec788d50202551753c00c5ea349705782523b03d1ab47fb6557c2b6ab2bf7565559d43b8b3023169fcd072f76881aae8c07f181e9915340c7629cc92bd90e53c9f2c4b14af515b8ac3ecdcb01bb895639f39a8fac9c677cc456223b025f85c9bf20e72ad323962355160f10d2249370d9239484561ce0733b6b8be28fbca4b15e1ec57092d87c1472cc7086241917d5b53ea6e4039d0b9efbc8cd55b8646c58235b1c3988c2282b08a2b788e8da33e798fc1a74001cca4ec6bbe99b4ecc5022f166e75e90d996f16403376c613b9da04944bba84b0ca9ee86c23089b5bc6665645f326aac43cb38755524be55b8d8c84ef702bf76ec70a09110401cc862ccf550051ac74faae10c911353d28bca94221b751f2271adbb0cef5a85280d6c06b41027fda20299b3c7cca9f29c94f282f83ec587a1e3442d4a271dfd3ca7e09814246b28fd867caf2241596e8953aefd1e0e0df0d1743a3e235eee4936aed2f869679fbfab1bea908d8fafa312d2c9ac1fad07fa899d80dac2f4baf69238b40efbebbfafcd12db865122725127136081f3880576665f3d850518085dc704f4524ccfdfff6edeaa23d93991e33417af22f118be39b8771027b8f0b2d337bd68864bdf3f349cd17211bcc85b97bd00a4c63119980367721bf007cfe378b2f682e7c5a6471f6c713b9cb0bda0bd760b71339e369db309a130d38c7efae4d38d0488c493851114d7eefad76a827778113acac9e8a67f9a850f2f7ac8bbf84610616a912ef82410989ec31c4a3e030588ef8770b6c30378687fa0eff2a4446242d549bea250e781e3d87a7e924953bc08a2e92303bb04744dc48ab252f661172d76154a571616bc1a2dcaae24b34524330ded56b29929bdb874263dab2f543c5bc6ae7d3105852d85696a7f7ec98b927c89'
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': "printf '%s' '" + PART + "' >> /tmp/mfg-main.hex\necho C36000", 'Timeout': 120, 'InstanceId': [INSTANCE]})
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
result = {'step': 'C36000', 'part_len': len(PART), 'invoke_id': invoke_id, 'status': None if out is None else out.get('InvocationStatus'), 'exit': None if out is None else out.get('ExitCode'), 'output': None if out is None else (out.get('Output') or '')[-300:]}
