import json, pathlib, time, urllib.request, subprocess

MCP_URL = "https://openapi-mcp.ap-southeast-1.aliyuncs.com/id/GC6rQufakqkwOHuj/mcp"
TOKEN_PATH = pathlib.Path.home() / ".mcp-auth" / "mcp-remote-0.1.38" / "47f185b1cffefbf96aa243d9a80c53f4_tokens.json"
BASE = pathlib.Path(r"c:\Users\John Ranel\Documents\BluearmERP\bluearmerp-v3-github\bluearmerp-v3\.ecs-patch")
SCRIPTS = [
    ("boms", "_deploy_production_split_boms.py", 40, 10),
    ("reports", "_deploy_production_split_reports.py", 40, 10),
    ("work_orders", "_deploy_production_split_work_orders.py", 40, 10),
    ("rebuild", "_deploy_production_split_rebuild.py", 90, 10),
]
OUT_PATH = BASE / "_deploy_production_split_mcp_result.json"

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

def run_step(access, session, req_id, name, script_path, max_polls, poll_sec):
    script = script_path.read_text(encoding="utf-8")
    print(f"\n=== STEP {name} script_len={len(script)} ===", flush=True)
    session, run = mcp_call(access, "tools/call", {"name": "AlibabaCloud___RunScript", "arguments": {"script": script}}, req_id=req_id, session=session, timeout=180)
    parsed = parse_tool_text(run)
    print(f"RUN_INITIAL status={parsed.get('status')} nextAction={parsed.get('nextAction')} processID={parsed.get('processID')}", flush=True)
    if parsed.get("error"):
        return session, req_id + 1, False, parsed
    final = parsed
    process_id = parsed.get("processID")
    if process_id and (parsed.get("nextAction") == "GetTask" or not is_terminal(parsed.get("status"))):
        for i in range(max_polls):
            time.sleep(poll_sec)
            session, task = mcp_call(access, "tools/call", {"name": "AlibabaCloud___GetTask", "arguments": {"processID": process_id}}, req_id=req_id + 1 + i, session=session, timeout=180)
            final = parse_tool_text(task)
            st = final.get("status")
            na = final.get("nextAction")
            print(f"POLL {name} {i+1}/{max_polls} status={st} nextAction={na}", flush=True)
            req_id += 1
            if is_terminal(st):
                if na in ("None", "Stop", None, ""):
                    break
            if na == "Stop" and is_terminal(st):
                break
    ok = final.get("status") in ("Success", "Succeeded")
    if not ok:
        res = final.get("result") or final
        print(f"STEP_FAILED {name}: {json.dumps(res, ensure_ascii=False)[:4000]}", flush=True)
    return session, req_id + max_polls + 5, ok, final

errors = []
summary = {"boms_ok": False, "reports_ok": False, "work_orders_ok": False, "rebuild_ok": False, "health_code": None, "errors": errors}
steps_out = {}

try:
    access = json.loads(TOKEN_PATH.read_text(encoding="utf-8"))["access_token"]
except Exception as e:
    errors.append(f"token_load: {e}")
    OUT_PATH.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary))
    raise SystemExit(1)

session, init = mcp_call(access, "initialize", {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "prod-split-deploy", "version": "1"}}, req_id=1)
session, _ = mcp_call(access, "notifications/initialized", {}, req_id=2, session=session)
req_id = 3

for key, fname, max_polls, poll_sec in SCRIPTS:
    path = BASE / fname
    if not path.exists():
        errors.append(f"{key}: missing script {fname}")
        steps_out[key] = {"ok": False}
        continue
    session, req_id, ok, final = run_step(access, session, req_id, key, path, max_polls, poll_sec)
    steps_out[key] = {"ok": ok, "final": final}
    summary[f"{key}_ok"] = ok
    if not ok:
        err_text = json.dumps(final, ensure_ascii=False, default=str)
        errors.append(f"{key}: {err_text[:8000]}")
        break

# external health check
health_code = None
try:
    r = subprocess.run(["curl.exe", "-sS", "-o", "NUL", "-w", "%{http_code}", "https://api.bluearmerp.com/health"], capture_output=True, text=True, timeout=60)
    health_code = (r.stdout or "").strip()
    if r.returncode != 0 and not health_code:
        errors.append(f"health_curl: rc={r.returncode} stderr={r.stderr[:500]}")
except Exception as e:
    errors.append(f"health_curl: {e}")
summary["health_code"] = health_code
if health_code:
    try:
        summary["health_code_int"] = int(health_code)
    except ValueError:
        pass

summary["steps"] = steps_out
OUT_PATH.write_text(json.dumps(summary, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
print("\nWROTE", OUT_PATH)
print(json.dumps({k: summary[k] for k in ["boms_ok", "reports_ok", "work_orders_ok", "rebuild_ok", "health_code", "errors"]}))
