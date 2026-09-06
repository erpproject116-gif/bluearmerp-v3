INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
PART = '0aeabe2305825815e067c31815647c576a5b723b0c585a787d05cae86efc774d3dbcfa6b730f5026dac3abbf36f5206e111b3b11c5a2fdd0ebc6c9289b8ce629a992f189c912f50433be15a3524e9080b6dc84af6a3aac9398227b3fda6d54aaf27aad91bf56eadb72fbf44534de19856621c99b1c68066f66f9f1ee341d66dd954875e58778ac62a460142f8a6c751c8a9a22a6139213b138b1924906fc6353692555ea0cd97a823532a607d65a7974a5a9bd20ce4644cc30e246e5d195c616eb364c63bf4d5d36f6d6205047774dd3841b7387d8736e92d4fdd937cbf62bedda76c712358df1c6102da9fb8e9588f6d96432131f43534d7f4c0d351ac718b1b2691e62a4627c84e10ad10106cd72e2c30a16f707132a161d42d0626721fa5cdb9447ab0f8017b469f5418e4f18f1ad1f5b1dd96eaad91117ba612a1eb52ef216245a52af45ac449084d6db1b85c9697d1d9bb4d696f538afb84d92a3b85969ac60a2044b5e2d5e745bab75f8a2e69414b6b1a3963ddc12c108bd85afb1938a4c395ec19b72bc689b29476bb7ecc199b20a0407f578341074b4c88402e3d1ecb0ec1a85ed9cc225a8f0a5a4d85077273f62f812ae08fe51c733a9f885725ca1117e2d2f95eb9408e102a18be5b0ec5cf3cabadb6b29f99ab27517cc75e2a42910b9648e486ff177e6eeb1564a8a2d4123185e058ad45e3887d96af3aae1d2b989810d4f24f4bec5d5732bbecd94acbd7e5e88f7a9a9517305ddcc24048a45afa16b4f3807cccd57d10d549995a9bd8ebe260851ffba896324cc4745b016419376bf7f216c48a1383d6eb2082a33e4a9af458d4c29de6c3f54a42c28da6cf0ddccd276deb8172ce45a9e62c9fbb264c0d0145f3f88bfd6f67158ee61ac5cdc1c15aba920cb71ab542cf5076b3621e354ba2d5a97c58246aa5462235e627a422536e3254ac9f9ded8b85bd38cd104ddd808af02b34ca552f115700aaab5a8b143a5726a2d02e6a7f45e01bdceea940ada708f598212c2ae07a7ea14da70675adba4de04cd46a5545ead4a8d312995bbe7956bb621a58af7e31563a6a354ef81572f62324aa51f7aa5c396a254582d658d752895b357b2d12894e88cde4eb546a15454efab5ae3502aaa565510cbd1defed91e9259f5faaef33ac5b59d14a79426266c6128afdb44883175d596ca8b32b2d164763a32be92e4416558b285af415d1ed5ba940bdd8dca5bb94bbb1c55b77ffec5210ba3268d5a3d9b56e738eb37b2e68229ef'
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'PlainText', 'CommandContent': "printf '%s' '" + PART + "' >> /tmp/mfg-main.hex\necho C50400", 'Timeout': 120, 'InstanceId': [INSTANCE]})
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
result = {'step': 'C50400', 'part_len': len(PART), 'invoke_id': invoke_id, 'status': None if out is None else out.get('InvocationStatus'), 'exit': None if out is None else out.get('ExitCode'), 'output': None if out is None else (out.get('Output') or '')[-300:]}
