INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
PART = 'cbd31c855c2a4c118061f2095fa67e622dc41653112b5d37c5bad953f3e8c87b43f50a458b7126e380a8e6a9c1485ba682d352b6974ea1170090d594bd3ae76b548a93bc1112b05c41401028b9d3ca477a1774a7c92b7ad54f38fc170138ef7b3ad08f655fa62b179adef24c07e67963ed40c5ba3ad61eb2eb5aaf6afb8d2f1c8cc07e196aa7ed5a191af55d56a55d7b5dba15ba708018fdfe7131d6c69cc57b19c37ce115ebc8eb2120657b9a9ced313289229f794169b165f0f1fad5540d97c51e237d6ecbfc55b4ed60b3a96c36d860a8a9280aa826a7c59e4d4eddb69db7c1f1c67144757380964e0e15f666e1bee77d05f048e875fb1e3e0155976956182abed6e9cb8fb2e1fb525e5d4a1281847ec20fd1e3e2044ea9aa80678c0d100469403d40d1e74f92e3f40cad53493ec75b690a4647c7fd301d8f315984d464ccb29f85f589d318ab5566d374065fc667eac488cfa27de4a430a9738e9abe9c8ef457f5d2d2286de157d1334c47e122ad569cf08a61f4229798a890a48178179d814c391c7bb6c21c9fba99e5e483e8066a747d82a3745550203cbe89d61431ce734076a1569c04ab3b9a51bd8949e3ec580cb0936c961f9c593c5de79381df04f5c717083aef529bed2e8bb848c450fb8bf1d67c8fb10d00db6d961e54c9ab1d17df43ed2e83f1d3a20d4e371d86e7c38573d1d969a371d26f07737e6de1f5ea73ee4f93fe677f3e3acc96bef9179f7afdcfc6fadd871bb6fe67e3e1dd0757fa9fcff25950ff73ad73705c713b80760a2125997f4bd8f4188f1311253b392ac623e098a6c894a7e344a01b1d0a3338068a7905ad664ac3e1576776043b400b4501958e40c5dba440324227a28e3ba85e8c4f32799ffaf4e3349b94d9a3a1f02211544e2801e09c42ddd3b0ca4f32bcb5c4729845950ae23d8e1a311d91ead4ab6b7ef108993a36a6748173f2bec9d130c35415483710e4e53a37d8b55c4f909d974d312bdc40bc6e59688f96643bb92da1725b841b004146004b840fa68768770c2f0e67c57c7a9d9bebaaa6288b515a0e93717e9c57c9060bdaaa8cacf52c99a59a7e2643623135019c8bc5886ecec82fa2cb0cf3acc44bc0521ccbc05995b0a063ed1bb33a516c23623b17bc7933c84608ab181289a2196a9ba0e53279f57aedd54e52a28b54921ea6f9c4e01bea4ed2c999c2310a52a6502cd0e832fc948d637da40328d5c08315955fac1852606766d8981e0bf41726ce8098dec6b490141891e940'
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': "printf '%s' '" + PART + "' >> /tmp/mfg-main.hex\necho C41400", 'Timeout': 120, 'InstanceId': [INSTANCE]})
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
result = {'step': 'C41400', 'part_len': len(PART), 'invoke_id': invoke_id, 'status': None if out is None else out.get('InvocationStatus'), 'exit': None if out is None else out.get('ExitCode'), 'output': None if out is None else (out.get('Output') or '')[-300:]}
