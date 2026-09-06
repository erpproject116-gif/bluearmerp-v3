import base64
import pathlib

routes = pathlib.Path("../api/internal/modules/manufacturing/routes.go").read_bytes()
assert b"from-sales-order" in routes
rb64 = base64.b64encode(routes).decode()

shell = f"""set +e
echo {rb64} | base64 -d > /root/bluearmerp-v3/api/internal/modules/manufacturing/routes.go
set -e
wc -c /root/bluearmerp-v3/api/internal/modules/manufacturing/routes.go /root/bluearmerp-v3/api/internal/modules/manufacturing/wo_so_link_slip.go
grep -n createWorkOrderFromSalesOrder /root/bluearmerp-v3/api/internal/modules/manufacturing/wo_so_link_slip.go
grep -n from-sales-order /root/bluearmerp-v3/api/internal/modules/manufacturing/routes.go
docker inspect bluearm-api --format '{{{{range .Config.Env}}}}{{{{println .}}}}{{{{end}}}}' > /tmp/bluearm-api.env
cd /root/bluearmerp-v3/api
docker build -t bluearm-api:latest .
docker stop bluearm-api || true
docker rm bluearm-api || true
docker run -d --name bluearm-api --restart unless-stopped --env-file /tmp/bluearm-api.env -p 8080:8080 bluearm-api:latest
sleep 5
docker ps --filter name=bluearm-api --format '{{{{.Names}}}} {{{{.Status}}}}'
docker exec bluearm-api sh -c 'grep -a -o from-sales-order /proc/1/exe | head -1'
code=$(curl -sS -o /dev/null -w '%{{http_code}}' -X POST http://127.0.0.1:8080/api/v1/manufacturing/work-orders/from-sales-order/1 || true)
echo POST_from_so=$code
curl -sS -o /dev/null -w 'health=%{{http_code}}' http://127.0.0.1:8080/health || true
echo
echo SURG2_DONE
"""

cb64 = base64.b64encode(shell.encode()).decode()
pathlib.Path("_phase_routes_build.b64").write_text(cb64, encoding="ascii")

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
pathlib.Path("_rs_phase_routes.py").write_text(rs, encoding="utf-8")
print("routes_bytes", len(routes))
print("cmd_b64", len(cb64))
print("rs_len", len(rs))
