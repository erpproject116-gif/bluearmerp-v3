import base64
import pathlib

routes = pathlib.Path("internal/modules/manufacturing/routes.go").read_bytes()
assert b"from-sales-order" in routes
assert b"listOpenSalesOrderSlipLinesForWO" in routes
assert b"listOpenSalesOrderLinesForWO" not in routes  # ECS-compatible subset
hx = routes.hex()
print("routes_bytes", len(routes), "hex_len", len(hx))

# single-shot xxd from hex via printf chunks of 1800 hex chars
chunk_size = 1800
chunks = [hx[i : i + chunk_size] for i in range(0, len(hx), chunk_size)]
print("nchunks", len(chunks))

parts = []
parts.append("set -e\nrm -f /tmp/routes.go.hex\n")
for i, c in enumerate(chunks):
    parts.append(f"printf '%s' '{c}' >> /tmp/routes.go.hex\necho OK_R{i}\n")
parts.append(
    """xxd -r -p /tmp/routes.go.hex > /root/bluearmerp-v3/api/internal/modules/manufacturing/routes.go
wc -c /tmp/routes.go.hex /root/bluearmerp-v3/api/internal/modules/manufacturing/routes.go /root/bluearmerp-v3/api/internal/modules/manufacturing/wo_so_link_slip.go
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
)
shell = "".join(parts)
cb64 = base64.b64encode(shell.encode()).decode()
pathlib.Path("_phase_patch_routes.b64").write_text(cb64, encoding="ascii")
print("cmd_b64", len(cb64))

rs = f"""INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'
REGION = 'ap-southeast-1'
CONTENT = "{cb64}"
TIMEOUT = 900
r = await call_cli(product='Ecs', action='RunCommand', version='2014-05-26', region=REGION, params={{'RegionId': REGION, 'Type': 'RunShellScript', 'ContentEncoding': 'Base64', 'CommandContent': CONTENT, 'Timeout': TIMEOUT, 'InstanceId': [INSTANCE]}})
invoke_id = r['InvokeId']
out = None
for _ in range(320):
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
pathlib.Path("_rs_phase_patch_routes.py").write_text(rs, encoding="utf-8")
print("rs_len", len(rs))
