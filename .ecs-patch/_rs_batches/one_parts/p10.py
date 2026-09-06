INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
PART = '88719110ac723fbfe563ef9ae194adc613f18fc73ffbccc50931132dab9b70923289d3911cc0cdbfff3df90a1a1d3c2fe150ca4fb2252045ba4980956c80b2421bd40dc36c6cd4705b3263bb39a8e5285919cae525d219c322534e25a6c8b360ca6a51baf84005be726e278b4e9fab0c0106825dc007ba65dbd12d040e52c468d521663744a7c497c569572d58204b3725b957957a96e66014704c73ca73062f72ba374eddd2a8d9ae6c6a9a015f503dcfed64c4e67f8ac11e1ddd41e7edceeacd72f5e6fa3d5471e89a560881f50d11e2cc800cd3e37decf66e6ea025912629a57f17b8a2996fcaa00df08928a279a2ea9a6226ce80e890a7bfa54728a5caeb3cd337a5c0e5e20e664ab5b6b450a1281dca783270656278c4654b4bd4b5e3aaca4c9863b122d7da0760f57a150d083912fbe7512c1c3de1a67a1acdac7bad0eae163553e95d11bac0aa1a8886301a681b03394b7fcb9e6222548c65615b952cbc176a2e27606fd094e4a94e492a357d4435a4c8229897c7c8f8d76c9d000a6f2704094dd048a41b19b4cbddab7bca1b9857793a36978b4e9986f38446d71267232959b9ea4545edd218d34f1cdda0520cfa7a3fae7293cdd8ea3449348846f513299d45144bcd5aa580664b8578d83fdb9b973cd25734536cffc6431182a57fe33ffa37fed0bf01cced8d0d28b5b1c94f06bce5c995cac53acd4f29c2ab39d3fb01fcedb3634d25a685f2b6841ba6a72668245511c26504fdfa7554b39fb8c84768f4683afda1a4cad8a8dacecbb1cd4dd2a6589d16f2a6771a63e66a325004aee4b091c1b2a695448da3f7c478700cf62ee8a0f43ea20c9602a43d2d84ec2d2d82048501265d48d41df8d241c845e54b910e7e0bd2a32fc1e89be82f578cd17c12cf16b300a957e18d44f55a657b4d4af7777d0afb143af0a9e15f51b8262e9c2687acf668961e549d85d743df2f777626e3b3845ae1eae604e68a911732203d75d2429955f2d255b52c362df156a821033eb8a3a26ab1eb597327bbc1f95e5f96d2bc2e7b65f85bea5eabbbf057df66dc43e92726bd9a685a4e5fc15b55ef0cf3066bbd5c60b84ebcdef623e61dc6c76ccc42cc807d896e655191ceadf0abc9748df065514b09b632b8753d844741be240e65a1c0b526de38b08954fa36afb7e9223e825d4d1f6c71515ed5c372c2f61e6663604f3a6d47e8ddf3d7d82498d68363c42032d8430f87b2b1f4590272faf008e3bc941865f3241fd511aad0385d0a8fe5'
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': "printf '%s' '" + PART + "' >> /tmp/mfg-main.hex\necho C18000", 'Timeout': 120, 'InstanceId': [INSTANCE]})
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
result = {'step': 'C18000', 'part_len': len(PART), 'invoke_id': invoke_id, 'status': None if out is None else out.get('InvocationStatus'), 'exit': None if out is None else out.get('ExitCode'), 'output': None if out is None else (out.get('Output') or '')[-300:]}
