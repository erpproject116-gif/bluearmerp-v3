import json, pathlib, time, urllib.request

MCP_URL = "https://openapi-mcp.ap-southeast-1.aliyuncs.com/id/GC6rQufakqkwOHuj/mcp"
TOKEN_PATH = pathlib.Path.home() / ".mcp-auth" / "mcp-remote-0.1.38" / "47f185b1cffefbf96aa243d9a80c53f4_tokens.json"
SCRIPT_PATH = pathlib.Path(r"c:\Users\John Ranel\Documents\BluearmERP\bluearmerp-v3-github\bluearmerp-v3\.ecs-patch\_deploy_live_from_git.py")
OUT_PATH = pathlib.Path(r"c:\Users\John Ranel\Documents\BluearmERP\bluearmerp-v3-github\bluearmerp-v3\.ecs-patch\_deploy_live_runscript_result.json")

def mcp_call(access_token, method, params, req_id=1, session=None, timeout=300):
    body = json.dumps({"jsonrpc": "2.0", "id": req_id, "method": method, "params": params}, ensure_ascii=False).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "Authorization": f"Bearer {access_token}",
    }
    if session:
        headers["Mcp-Session-Id"] = session
    req = urllib.request.Request(MCP_URL, data=body, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        sid = resp.headers.get("Mcp-Session-Id") or resp.headers.get("mcp-session-id")
        raw = resp.read().decode("utf-8", errors="replace")
    data_lines = [ln[5:].lstrip() for ln in raw.splitlines() if ln.startswith("data:")]
    payload = json.loads("\n".join(data_lines)) if data_lines else json.loads(raw)
    return sid or session, payload

def parse_tool_text(result):
    inner = result.get("result") or {}
    for c in inner.get("content", []):
        if c.get("type") == "text" and c.get("text"):
            try:
                return json.loads(c["text"])
            except json.JSONDecodeError:
                return {"raw_text": c["text"]}
    return inner

access = json.loads(TOKEN_PATH.read_text(encoding="utf-8"))["access_token"]
script = SCRIPT_PATH.read_text(encoding="utf-8")
print("script_len", len(script))

session, init = mcp_call(access, "initialize", {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "deploy-live", "version": "1"}}, req_id=1)
session, _ = mcp_call(access, "notifications/initialized", {}, req_id=2, session=session)
session, run = mcp_call(access, "tools/call", {"name": "AlibabaCloud___RunScript", "arguments": {"script": script}}, req_id=3, session=session, timeout=120)
parsed = parse_tool_text(run)
print("RUN_INITIAL status=", parsed.get("status"), "nextAction=", parsed.get("nextAction"))

process_id = parsed.get("processID")
final = parsed
if process_id and (parsed.get("nextAction") == "GetTask" or parsed.get("status") in ("Running", "Pending", None)):
    for i in range(200):
        time.sleep(15)
        session, task = mcp_call(access, "tools/call", {"name": "AlibabaCloud___GetTask", "arguments": {"processID": process_id}}, req_id=4 + i, session=session, timeout=120)
        final = parse_tool_text(task)
        st = final.get("status")
        na = final.get("nextAction")
        print(f"POLL {i+1} status={st} nextAction={na}")
        if st in ("Success", "Failed", "Expired", "PartialFailed", "Succeeded") and na in ("None", "Stop", None):
            break
        if na == "Stop":
            break

OUT_PATH.write_text(json.dumps({"initial": parsed, "final": final}, ensure_ascii=False, indent=2), encoding="utf-8")
print("WROTE", OUT_PATH)
res = (final.get("result") or {}) if isinstance(final, dict) else {}
print("RESULT", json.dumps(res, ensure_ascii=False))
