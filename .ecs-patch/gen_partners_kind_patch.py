import base64
from pathlib import Path

root = Path(__file__).resolve().parent
inner = (root / "_partners_kind_inner.py").read_bytes()
b64 = base64.b64encode(inner).decode("ascii")

runner = f'''INSTANCE = "i-t4n5tdhzaktd0x6tc34w"
REGION = "ap-southeast-1"
PY_B64 = "{b64}"

async def run_shell(script, timeout=120):
    r = await call_cli(product="Ecs", action="RunCommand", version="2014-05-26", region=REGION, params={{"RegionId": REGION, "Type": "RunShellScript", "ContentEncoding": "PlainText", "CommandContent": script, "Timeout": int(timeout), "InstanceId": [INSTANCE]}})
    invoke_id = r["InvokeId"]
    for _ in range(300):
        await asyncio.sleep(3)
        d = await call_cli(product="Ecs", action="DescribeInvocationResults", version="2014-05-26", region=REGION, params={{"RegionId": REGION, "InvokeId": invoke_id, "ContentEncoding": "PlainText"}})
        items = d.get("Invocation", {{}}).get("InvocationResults", {{}}).get("InvocationResult", [])
        if not items:
            continue
        item = items[0]
        st = item.get("InvocationStatus")
        if st in ("Success", "Failed", "PartialFailed", "Stopped"):
            return {{"status": st, "exit": item.get("ExitCode"), "output": (item.get("Output") or "")[-8000:]}}
    return {{"status": "Timeout", "invoke_id": invoke_id}}

patch_cmd = "set -e\\ncd /root/bluearmerp-v3\\nprintf '%s' '" + PY_B64 + "' | base64 -d > /tmp/patch_partners_kind.py\\npython3 /tmp/patch_partners_kind.py\\n"
r1 = await run_shell(patch_cmd, timeout=120)
out1 = r1.get("output") or ""
if r1.get("status") != "Success" or ("PATCHED" not in out1 and "ALREADY_HAS_KIND" not in out1):
    result = {{"ok": False, "step": "patch", "r1": r1}}
else:
    r2 = await run_shell("""set -e
cd /root/bluearmerp-v3
docker inspect bluearm-api --format '{{{{range .Config.Env}}}}{{{{println .}}}}{{{{end}}}}' > /tmp/bluearm-api.env
cd api
docker build --no-cache -t bluearm-api:latest .
docker stop bluearm-api || true
docker rm bluearm-api || true
docker run -d --name bluearm-api --restart unless-stopped --env-file /tmp/bluearm-api.env -p 8080:8080 bluearm-api:latest
sleep 10
echo HEALTH_CODE_START
curl -sS -o /dev/null -w '%{{http_code}}' http://127.0.0.1:8080/health || true
echo
echo DEPLOY_PARTNERS_KIND_DONE
""", timeout=900)
    result = {{"ok": r2.get("status") == "Success" and "DEPLOY_PARTNERS_KIND_DONE" in (r2.get("output") or ""), "r1": r1, "r2": r2}}
'''

# Fix docker format braces - the f-string doubling got messy. Write without f for build section.
runner = '''INSTANCE = "i-t4n5tdhzaktd0x6tc34w"
REGION = "ap-southeast-1"
PY_B64 = "%s"

async def run_shell(script, timeout=120):
    r = await call_cli(product="Ecs", action="RunCommand", version="2014-05-26", region=REGION, params={"RegionId": REGION, "Type": "RunShellScript", "ContentEncoding": "PlainText", "CommandContent": script, "Timeout": int(timeout), "InstanceId": [INSTANCE]})
    invoke_id = r["InvokeId"]
    for _ in range(300):
        await asyncio.sleep(3)
        d = await call_cli(product="Ecs", action="DescribeInvocationResults", version="2014-05-26", region=REGION, params={"RegionId": REGION, "InvokeId": invoke_id, "ContentEncoding": "PlainText"})
        items = d.get("Invocation", {}).get("InvocationResults", {}).get("InvocationResult", [])
        if not items:
            continue
        item = items[0]
        st = item.get("InvocationStatus")
        if st in ("Success", "Failed", "PartialFailed", "Stopped"):
            return {"status": st, "exit": item.get("ExitCode"), "output": (item.get("Output") or "")[-8000:]}
    return {"status": "Timeout", "invoke_id": invoke_id}

patch_cmd = "set -e\\ncd /root/bluearmerp-v3\\nprintf '%%s' '" + PY_B64 + "' | base64 -d > /tmp/patch_partners_kind.py\\npython3 /tmp/patch_partners_kind.py\\n"
r1 = await run_shell(patch_cmd, timeout=120)
out1 = r1.get("output") or ""
if r1.get("status") != "Success" or ("PATCHED" not in out1 and "ALREADY_HAS_KIND" not in out1):
    result = {"ok": False, "step": "patch", "r1": r1}
else:
    r2 = await run_shell("""set -e
cd /root/bluearmerp-v3
docker inspect bluearm-api --format '{{range .Config.Env}}{{println .}}{{end}}' > /tmp/bluearm-api.env
cd api
docker build --no-cache -t bluearm-api:latest .
docker stop bluearm-api || true
docker rm bluearm-api || true
docker run -d --name bluearm-api --restart unless-stopped --env-file /tmp/bluearm-api.env -p 8080:8080 bluearm-api:latest
sleep 10
echo HEALTH_CODE_START
curl -sS -o /dev/null -w '%%{http_code}' http://127.0.0.1:8080/health || true
echo
echo DEPLOY_PARTNERS_KIND_DONE
""", timeout=900)
    result = {"ok": r2.get("status") == "Success" and "DEPLOY_PARTNERS_KIND_DONE" in (r2.get("output") or ""), "r1": r1, "r2": r2}
''' % b64

# The %% above is wrong for final file - fix curl format
runner = runner.replace("w '%%{http_code}'", "w '%{http_code}'")
runner = runner.replace("printf '%%s'", "printf '%s'")

out = root / "_deploy_partners_kind_patch.py"
out.write_text(runner, encoding="utf-8", newline="\n")
print("Wrote", out, "chars", out.stat().st_size)
