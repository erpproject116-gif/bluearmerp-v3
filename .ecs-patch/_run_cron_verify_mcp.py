import json, pathlib, time, urllib.request

MCP_URL = "https://openapi-mcp.ap-southeast-1.aliyuncs.com/id/GC6rQufakqkwOHuj/mcp"
TOKEN_PATH = pathlib.Path.home() / ".mcp-auth" / "mcp-remote-0.1.38" / "47f185b1cffefbf96aa243d9a80c53f4_tokens.json"
B64 = (pathlib.Path(__file__).parent / "_cron_verify_b64.txt").read_text(encoding="utf-8").strip()

def mcp_call(access_token, method, params, req_id=1, session=None, timeout=120):
    body = json.dumps({"jsonrpc": "2.0", "id": req_id, "method": method, "params": params}, ensure_ascii=False).encode("utf-8")
    headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream", "Authorization": f"Bearer {access_token}"}
    if session:
        headers["Mcp-Session-Id"] = session
    req = urllib.request.Request(MCP_URL, data=body, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        sid = resp.headers.get("Mcp-Session-Id") or resp.headers.get("mcp-session-id")
        raw = resp.read().decode("utf-8", errors="replace")
    data_lines = [ln[5:].lstrip() for ln in raw.splitlines() if ln.startswith("data:")]
    payload = json.loads("\n".join(data_lines)) if data_lines else json.loads(raw)
    return sid or session, payload

def tool_result(payload):
    inner = payload.get("result") or {}
    for c in inner.get("content", []):
        if c.get("type") == "text":
            try:
                return json.loads(c["text"])
            except json.JSONDecodeError:
                return {"raw": c["text"]}
    return inner

def run_b64(b64, access, session, req_id):
    run_cmd = (
        "aliyun ecs RunCommand --RegionId ap-southeast-1 --Type RunShellScript "
        "--InstanceId.1 i-t4n5tdhzaktd0x6tc34w --ContentEncoding Base64 --Timeout 120 "
        f"--CommandContent {b64}"
    )
    session, run_payload = mcp_call(access, "tools/call", {"name": "AlibabaCloud___CallCLI", "arguments": {"command": run_cmd}}, req_id, session, 180)
    run_res = tool_result(run_payload)
    invoke_id = run_res.get("InvokeId")
    for i in range(40):
        time.sleep(4)
        poll_cmd = f"aliyun ecs DescribeInvocationResults --RegionId ap-southeast-1 --InvokeId {invoke_id} --ContentEncoding PlainText"
        session, poll_payload = mcp_call(access, "tools/call", {"name": "AlibabaCloud___CallCLI", "arguments": {"command": poll_cmd}}, req_id + 1 + i, session, 120)
        poll_res = tool_result(poll_payload)
        inv = poll_res.get("Invocation") or {}
        items = (inv.get("InvocationResults") or {}).get("InvocationResult")
        if not items:
            continue
        item = items[0] if isinstance(items, list) else items
        st = item.get("InvocationStatus")
        if st in ("Success", "Failed", "PartialFailed", "Stopped"):
            return session, {"status": st, "exit": item.get("ExitCode"), "output": (item.get("Output") or "")[-8000:]}
    return session, {"status": "Timeout"}

access = json.loads(TOKEN_PATH.read_text(encoding="utf-8"))["access_token"]
session, _ = mcp_call(access, "initialize", {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "ecs-cron-verify", "version": "1"}}, 1)
session, _ = mcp_call(access, "notifications/initialized", {}, 2, session)
session, result = run_b64(B64, access, session, 3)
print(json.dumps(result, ensure_ascii=False))
