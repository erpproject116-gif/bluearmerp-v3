INSTANCE = "i-t4n5tdhzaktd0x6tc34w"
REGION = "ap-southeast-1"
PY_B64 = "ZnJvbSBwYXRobGliIGltcG9ydCBQYXRoCmltcG9ydCByZQoKcCA9IFBhdGgoImFwaS9pbnRlcm5hbC9tb2R1bGVzL2ludmVudG9yeS9wYXJ0bmVycy5nbyIpCnRleHQgPSBwLnJlYWRfdGV4dChlbmNvZGluZz0idXRmLTgiKQppZiAnUXVlcnkoKS5HZXQoImtpbmQiKScgaW4gdGV4dDoKICAgIHByaW50KCJBTFJFQURZX0hBU19LSU5EIikKZWxzZToKICAgIHBhdGNoID0gIlxuIi5qb2luKAogICAgICAgIFsKICAgICAgICAgICAgJ1x0XHRraW5kIDo9IHN0cmluZ3MuVG9Mb3dlcihzdHJpbmdzLlRyaW1TcGFjZShyLlVSTC5RdWVyeSgpLkdldCgia2luZCIpKSknLAogICAgICAgICAgICAiXHRcdHN3aXRjaCBraW5kIHsiLAogICAgICAgICAgICAnXHRcdGNhc2UgImN1c3RvbWVyIjonLAogICAgICAgICAgICAnXHRcdFx0d2hlcmUgKz0gIiBhbmQgcGFydG5lcl9raW5kIGluIChcJ2N1c3RvbWVyXCcsIFwnYm90aFwnKSInLAogICAgICAgICAgICAnXHRcdGNhc2UgInZlbmRvciI6JywKICAgICAgICAgICAgJ1x0XHRcdHdoZXJlICs9ICIgYW5kIHBhcnRuZXJfa2luZCBpbiAoXCd2ZW5kb3JcJywgXCdib3RoXCcpIicsCiAgICAgICAgICAgICJcdFx0fSIsCiAgICAgICAgICAgICIiLAogICAgICAgIF0KICAgICkKICAgIG0gPSByZS5zZWFyY2gociIoYXJnTlwrXCtcblx0XHRcfVxuXG4pKFx0XHRvcmRlciA6PSBcImFzY1wiKSIsIHRleHQpCiAgICBpZiBub3QgbToKICAgICAgICBtID0gcmUuc2VhcmNoKHIiKGFyZ05cK1wrXG4gICAgICAgICAgICAgICAgXH1cblxuKSggICAgICAgICAgICAgICAgb3JkZXIgOj0gXCJhc2NcIikiLCB0ZXh0KQogICAgaWYgbm90IG06CiAgICAgICAgaWR4ID0gdGV4dC5maW5kKCdvcmRlciA6PSAiYXNjIicpCiAgICAgICAgcHJpbnQoIk1BUktFUl9GQUlMIikKICAgICAgICBwcmludChyZXByKHRleHRbbWF4KDAsIGlkeCAtIDE4MCkgOiBpZHggKyA0MF0gaWYgaWR4ID49IDAgZWxzZSB0ZXh0WzozMDBdKSkKICAgICAgICByYWlzZSBTeXN0ZW1FeGl0KDIpCiAgICB0ZXh0ID0gdGV4dFs6IG0uc3RhcnQoKV0gKyBtLmdyb3VwKDEpICsgcGF0Y2ggKyBtLmdyb3VwKDIpICsgdGV4dFttLmVuZCgpIDpdCiAgICBwLndyaXRlX3RleHQodGV4dCwgZW5jb2Rpbmc9InV0Zi04IikKICAgIHByaW50KCJQQVRDSEVEIikKZm9yIGksIGxpbmUgaW4gZW51bWVyYXRlKHAucmVhZF90ZXh0KGVuY29kaW5nPSJ1dGYtOCIpLnNwbGl0bGluZXMoKSwgMSk6CiAgICBpZiAnR2V0KCJraW5kIiknIGluIGxpbmUgb3IgInBhcnRuZXJfa2luZCBpbiIgaW4gbGluZToKICAgICAgICBwcmludChmIntpfTp7bGluZX0iKQo="

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

patch_cmd = "set -e\ncd /root/bluearmerp-v3\nprintf '%s' '" + PY_B64 + "' | base64 -d > /tmp/patch_partners_kind.py\npython3 /tmp/patch_partners_kind.py\n"
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
curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/health || true
echo
echo DEPLOY_PARTNERS_KIND_DONE
""", timeout=900)
    result = {"ok": r2.get("status") == "Success" and "DEPLOY_PARTNERS_KIND_DONE" in (r2.get("output") or ""), "r1": r1, "r2": r2}
