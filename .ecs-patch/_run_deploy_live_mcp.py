import json, pathlib, time, urllib.request

MCP_URL = "https://openapi-mcp.ap-southeast-1.aliyuncs.com/id/GC6rQufakqkwOHuj/mcp"
TOKEN_PATH = pathlib.Path.home() / ".mcp-auth" / "mcp-remote-0.1.38" / "47f185b1cffefbf96aa243d9a80c53f4_tokens.json"
SCRIPT_PATH = pathlib.Path(r"c:\Users\John Ranel\Documents\BluearmERP\bluearmerp-v3-github\bluearmerp-v3\.ecs-patch\_deploy_live_from_git.py")
OUT_PATH = pathlib.Path(r"c:\Users\John Ranel\Documents\BluearmERP\bluearmerp-v3-github\bluearmerp-v3\.ecs-patch\_deploy_live_runscript_result.json")

def mcp_call(access_token, method, params, req_id=1, timeout=300):
    body = json.dumps({"jsonrpc": "2.0", "id": req_id, "method": method, "params": params}, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(MCP_URL, data=body, headers={
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "Authorization": f"Bearer {access_token}",
    }, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
    data_lines = [ln[5:].lstrip() for ln in raw.splitlines() if ln.startswith("data:")]
    if data_lines:
        return json.loads("\n".join(data_lines))
    return json.loads(raw)

def parse_tool_text(result):
    inner = result.get("result") or {}
    for c in inner.get("content", []):
        if c.get("type") == "text" and c.get("text"):
            try:
                return json.loads(c["text"])
            except json.JSONDecodeError:
                return {"raw_text": c["text"]}
    return inner

tokens = json.loads(TOKEN_PATH.read_text(encoding="utf-8"))
access = tokens["access_token"]
script = SCRIPT_PATH.read_text(encoding="utf-8")
print("script_len", len(script))

run = mcp_call(access, "tools/call", {"name": "AlibabaCloud___RunScript", "arguments": {"script": script}}, req_id=1, timeout=120)
parsed = parse_tool_text(run)
print("RUN_INITIAL", json.dumps(parsed, ensure_ascii=False)[:2000])

process_id = parsed.get("processID")
final = parsed
need_poll = process_id and (parsed.get("nextAction") == "GetTask" or parsed.get("status") in ("Running", "Pending", None))
if need_poll:
    for i in range(200):
        time.sleep(15)
        task = mcp_call(access, "tools/call", {"name": "AlibabaCloud___GetTask", "arguments": {"processID": process_id}}, req_id=2+i, timeout=120)
        final = parse_tool_text(task)
        st = final.get("status")
        na = final.get("nextAction")
        print(f"POLL {i+1} status={st} nextAction={na}")
        if st in ("Success", "Failed", "Expired", "PartialFailed") or na == "Stop":
            break
        if na != "GetTask" and st not in ("Running", "Pending"):
            break

OUT_PATH.write_text(json.dumps({"initial": parsed, "final": final}, ensure_ascii=False, indent=2), encoding="utf-8")
print("WROTE", OUT_PATH)
print("FINAL", json.dumps(final, ensure_ascii=False)[:12000])
