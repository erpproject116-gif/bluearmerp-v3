INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
PART = '9e04095b413c8edeef9554c2a9fb0a860c2c84a8fdb228759031bdfaa280ac0d1ba00cd0039df56bc73b024a22085fd495bc08275bbcc7c205a104aa7760616402927ee2d224755dfc1554c290b214ee77a908d24ec35b6e57cdf1a3c55d1f717325adf4f5dfdb8672b1db3e6aea9dd4d38bfa5df96b23894711b6e32e454d86fc70bf3d799db722e01d70191483b06d6b501d2027b78821c16e885b6d1d4abf4d2a1a9fbb910401d3e1f4ee88ab541d22d95955841c15d0e977a08c645ad0db124174197131c87a93a49273e6b691260b3ffe1461f27ed177f2e1bc36e3498c3dbcce6ecaadec33b7f022d04f58024f053728be1b9f53f15d2a9de52f9ef6051eb163429491fc95f861e8b5f82da8f1a56445a95d92a0fdac192c111eebe61a750ef964eedc223b294ac69365ee323d9aaef8bc2f90ae2f9849319c6232903bb2f473475eb379c22d518a6f7a958af29ac3d601c59f56743d974ecec42359ce3040e232baa322bdd33361f822e629b3c188f34b6a1d748e189ca8c91843154cdec7ae7893ac261bbd6425512d39c91fdfb941dd37e241dd69ecf2adc3f5022799746fc3821793837c764c06b0b7b33d40ca59014231feca277baa12fe34a6b23ddd6e17c080a6adabe6d6150ec8c14c204946162aa41fa72d4164b83e4b25bc7d2913554a8a3b1d7cdf9c8cf19d483e29769cb7d876ae496785ad97a201beb6765df5c6c953f98ec20ebef4ffad091179b37307a666125762712b2fe4a8dc45e5996a4e9260ad541326e4683c4ac54a3ce98296527d5607b7dcb37c0c3b5a0053893d8f8bf1fc78b2451b858914d2004c8a25bc10976d04f6ab71dec2f95dc67199e27c692e094da6eda9a91146025440b73e3d66292c25289d0206a46734867e92a45a661fe8878d6cfdc0665326e10eea5151cb7661ec1a2c58eba19a3159264cc609613cc1f1937e71d1cad4e67605f269ab9dec56823a5c4c32b60af0424a43b2a46e341f58028f5054f91940a181807093dcfee5134f175a9f5bd2cfa34145dcdb7d09df125607eff6618d88ae5a900f566466016414a0ebb9391ee3c93d7416106a20c0991222522341cb046115414611b94e0f12ce6ea9d23b680c8f265948caf971d7be1fed25a9107d0817644b35261fb284d87af1aee89c0281409f5578b4321f077c47e7948ea71b3a8892e47056cca7c8b8d7dba85cebe11c105888da35c31260ac4bd06991840477599f490d00ada1007f307b672233779a73a22e47e7'
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': "printf '%s' '" + PART + "' >> /tmp/mfg-main.hex\necho C25200", 'Timeout': 120, 'InstanceId': [INSTANCE]})
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
result = {'step': 'C25200', 'part_len': len(PART), 'invoke_id': invoke_id, 'status': None if out is None else out.get('InvocationStatus'), 'exit': None if out is None else out.get('ExitCode'), 'output': None if out is None else (out.get('Output') or '')[-300:]}
