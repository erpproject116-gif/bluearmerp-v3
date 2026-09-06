import base64
import pathlib

routes = pathlib.Path("internal/modules/manufacturing/routes.go").read_bytes()
hx = routes.hex()
assert len(hx) == 4340
chunk_size = 1500
chunks = [hx[i : i + chunk_size] for i in range(0, len(hx), chunk_size)]
print("hex_len", len(hx), "nchunks", len(chunks), [len(c) for c in chunks])

for i, c in enumerate(chunks):
    if i == 0:
        shell = f"rm -f /tmp/routes.go.hex\nprintf '%s' '{c}' >> /tmp/routes.go.hex\necho OK_R{i}\n"
    else:
        shell = f"printf '%s' '{c}' >> /tmp/routes.go.hex\necho OK_R{i}\n"
    b64 = base64.b64encode(shell.encode()).decode()
    pathlib.Path(f"rchunk{i}.b64").write_text(b64, encoding="ascii")
    print(f"rchunk{i}", len(b64))

# decode+verify+build script (no routes payload)
build = """set -e
xxd -r -p /tmp/routes.go.hex > /root/bluearmerp-v3/api/internal/modules/manufacturing/routes.go
echo HEX_LEN=$(wc -c </tmp/routes.go.hex)
echo ROUTES_LEN=$(wc -c </root/bluearmerp-v3/api/internal/modules/manufacturing/routes.go)
echo SLIP_LEN=$(wc -c </root/bluearmerp-v3/api/internal/modules/manufacturing/wo_so_link_slip.go)
grep -n from-sales-order /root/bluearmerp-v3/api/internal/modules/manufacturing/routes.go
grep -n createWorkOrderFromSalesOrder /root/bluearmerp-v3/api/internal/modules/manufacturing/wo_so_link_slip.go
docker inspect bluearm-api --format '{{range .Config.Env}}{{println .}}{{end}}' > /tmp/bluearm-api.env
cd /root/bluearmerp-v3/api
docker build -t bluearm-api:latest .
docker stop bluearm-api || true
docker rm bluearm-api || true
docker run -d --name bluearm-api --restart unless-stopped --env-file /tmp/bluearm-api.env -p 8080:8080 bluearm-api:latest
sleep 5
docker ps --filter name=bluearm-api --format '{{.Names}} {{.Status}}'
docker exec bluearm-api sh -c 'grep -a -o from-sales-order /proc/1/exe | head -1'
code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:8080/api/v1/manufacturing/work-orders/from-sales-order/1 || true)
echo POST_from_so=$code
curl -sS -o /dev/null -w 'health=%{http_code}' http://127.0.0.1:8080/health || true
echo
echo SURG2_DONE
"""
pathlib.Path("rbuild.b64").write_text(base64.b64encode(build.encode()).decode(), encoding="ascii")
print("rbuild", pathlib.Path("rbuild.b64").stat().st_size)

# Also write tiny RunScript wrappers that load CONTENT from the exact b64 files
for name in ["rchunk0", "rchunk1", "rchunk2", "rbuild"]:
    content = pathlib.Path(f"{name}.b64").read_text(encoding="ascii").strip()
    timeout = 900 if name == "rbuild" else 120
    loops = 320 if name == "rbuild" else 60
    rs = f"""INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
CONTENT = "{content}"
TIMEOUT = {timeout}
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={{'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'Base64', 'CommandContent': CONTENT, 'Timeout': TIMEOUT, 'InstanceId': [INSTANCE]}})
invoke_id = r['InvokeId']
out = None
for _ in range({loops}):
    await asyncio.sleep(3)
    d = await call_cli(product='Ecs', action='DescribeInvocationResults', version='2014-05-26', region=REGION, params={{'RegionId': REGION, 'InvokeId': invoke_id, 'ContentEncoding': 'PlainText'}})
    items = d.get('Invocation', {{}}).get('InvocationResults', {{}}).get('InvocationResult', [])
    if not items:
        continue
    item = items[0]
    st = item.get('InvocationStatus')
    if st in ('Success', 'Failed', 'PartialFailed', 'Stopped'):
        out = {{'status': st, 'exit': item.get('ExitCode'), 'output': (item.get('Output') or '')[-5000:], 'invoke_id': invoke_id}}
        break
result = out or {{'status': 'Timeout', 'invoke_id': invoke_id}}
"""
    pathlib.Path(f"_rs_{name}.py").write_text(rs, encoding="utf-8")
    print(f"_rs_{name}.py", len(rs))
