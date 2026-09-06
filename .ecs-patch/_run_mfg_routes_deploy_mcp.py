import json, pathlib, time, urllib.request, subprocess

MCP_URL = "https://openapi-mcp.ap-southeast-1.aliyuncs.com/id/GC6rQufakqkwOHuj/mcp"
TOKEN_PATH = pathlib.Path.home() / ".mcp-auth" / "mcp-remote-0.1.38" / "47f185b1cffefbf96aa243d9a80c53f4_tokens.json"
BASE = pathlib.Path(r"c:\Users\John Ranel\Documents\BluearmERP\bluearmerp-v3-github\bluearmerp-v3\.ecs-patch")
SCRIPT = BASE / "_deploy_mfg_routes_only.py"
OUT_PATH = BASE / "_deploy_mfg_routes_mcp_result.json"

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
    if result.get("error"):
        return {"error": result["error"]}
    inner = result.get("result") or {}
    for c in inner.get("content", []):
        if c.get("type") == "text" and c.get("text"):
            try:
                return json.loads(c["text"])
            except json.JSONDecodeError:
                return {"raw_text": c["text"]}
    return inner

def is_terminal(st):
    return st in ("Success", "Succeeded", "Failed", "Expired", "PartialFailed", "Stopped")

summary = {"ok": False, "health_code": None, "report_code": None, "errors": []}

access = json.loads(TOKEN_PATH.read_text(encoding="utf-8"))["access_token"]
session, _ = mcp_call(access, "initialize", {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "mfg-routes-deploy", "version": "1"}}, req_id=1)
session, _ = mcp_call(access, "notifications/initialized", {}, req_id=2, session=session)

script = SCRIPT.read_text(encoding="utf-8")
session, run = mcp_call(access, "tools/call", {"name": "AlibabaCloud___RunScript", "arguments": {"script": script}}, req_id=3, session=session, timeout=180)
parsed = parse_tool_text(run)
final = parsed
process_id = parsed.get("processID")
req_id = 4
if process_id and not is_terminal(parsed.get("status")):
    for i in range(120):
        time.sleep(15)
        session, task = mcp_call(access, "tools/call", {"name": "AlibabaCloud___GetTask", "arguments": {"processID": process_id, "waitTimeoutSeconds": 30}}, req_id=req_id, session=session, timeout=180)
        final = parse_tool_text(task)
        req_id += 1
        if is_terminal(final.get("status")) and final.get("nextAction") in ("None", None, "", "Stop"):
            break

res = final.get("result") or final
summary.update({
    "ok": bool(res.get("ok")),
    "health_code": res.get("health_code"),
    "report_code": res.get("report_code"),
    "status": final.get("status"),
    "last": res.get("last"),
})
if not summary["ok"]:
    summary["errors"].append(json.dumps(res, ensure_ascii=False, default=str)[:8000])

try:
    r = subprocess.run(["curl.exe", "-sS", "-o", "NUL", "-w", "%{http_code}", "https://api.bluearmerp.com/health"], capture_output=True, text=True, timeout=60)
    summary["external_health"] = (r.stdout or "").strip()
except Exception as e:
    summary["errors"].append(f"external_health: {e}")

OUT_PATH.write_text(json.dumps(summary, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
print(json.dumps(summary, ensure_ascii=False, default=str))
