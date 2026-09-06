import asyncio
import json
import pathlib
import subprocess
import sys

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

BASE = pathlib.Path(r"c:\Users\John Ranel\Documents\BluearmERP\bluearmerp-v3-github\bluearmerp-v3\.ecs-patch")
OUT_PATH = BASE / "_deploy_production_split_mcp_result.json"
SCRIPTS = [
    ("boms", "_deploy_production_split_boms.py", 60, 5),
    ("reports", "_deploy_production_split_reports.py", 60, 5),
    ("work_orders", "_deploy_production_split_work_orders.py", 60, 5),
    ("rebuild", "_deploy_production_split_rebuild.py", 180, 5),
]

def terminal_status(st):
    return st in ("Success", "Succeeded", "Failed", "Expired", "PartialFailed", "Stopped")

def needs_poll(parsed):
    na = parsed.get("nextAction")
    if na in ("GetTask", "CallGetTask"):
        return True
    st = parsed.get("status")
    return parsed.get("processID") and not terminal_status(st)

def parse_text_result(result):
    for c in result.content or []:
        if getattr(c, "type", None) == "text" and getattr(c, "text", None):
            try:
                return json.loads(c.text)
            except json.JSONDecodeError:
                return {"raw_text": c.text}
    return {"raw": str(result)}

async def poll_task(session, process_id, max_polls, poll_sec, label):
    final = None
    for i in range(max_polls):
        await asyncio.sleep(poll_sec)
        result = await session.call_tool("AlibabaCloud___GetTask", {"processID": process_id})
        final = parse_text_result(result)
        st = final.get("status")
        na = final.get("nextAction")
        print(f"POLL {label} {i+1}/{max_polls} status={st} nextAction={na}", flush=True)
        if terminal_status(st):
            if na in (None, "None", "Stop", ""):
                break
            if na not in ("GetTask", "CallGetTask"):
                break
    return final

async def run_script(session, label, path, max_polls, poll_sec):
    script = path.read_text(encoding="utf-8")
    print(f"=== RUN {label} len={len(script)} ===", flush=True)
    result = await session.call_tool("AlibabaCloud___RunScript", {"script": script})
    parsed = parse_text_result(result)
    print(f"INITIAL {label} status={parsed.get('status')} nextAction={parsed.get('nextAction')} processID={parsed.get('processID')}", flush=True)
    if parsed.get("error"):
        return False, parsed
    final = parsed
    pid = parsed.get("processID")
    if pid and needs_poll(parsed):
        final = await poll_task(session, pid, max_polls, poll_sec, label) or parsed
    ok = final.get("status") in ("Success", "Succeeded")
    if not ok:
        print(f"FAIL {label}: {json.dumps(final, ensure_ascii=False)[:6000]}", flush=True)
    return ok, final

async def main():
    errors = []
    summary = {
        "boms_ok": False,
        "reports_ok": False,
        "work_orders_ok": False,
        "rebuild_ok": False,
        "health_code": None,
        "errors": errors,
    }
    server = StdioServerParameters(
        command="npx",
        args=[
            "mcp-remote-alibaba-cloud",
            "https://openapi-mcp.ap-southeast-1.aliyuncs.com/id/GC6rQufakqkwOHuj/mcp",
        ],
    )
    async with stdio_client(server) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            for key, fname, max_polls, poll_sec in SCRIPTS:
                path = BASE / fname
                if not path.exists():
                    errors.append(f"{key}: missing {fname}")
                    break
                ok, final = await run_script(session, key, path, max_polls, poll_sec)
                summary[f"{key}_ok"] = ok
                if not ok:
                    errors.append(f"{key}: {json.dumps(final, ensure_ascii=False)[:8000]}")
                    break

    try:
        r = subprocess.run(
            ["curl.exe", "-sS", "-o", "NUL", "-w", "%{http_code}", "https://api.bluearmerp.com/health"],
            capture_output=True,
            text=True,
            timeout=60,
        )
        summary["health_code"] = (r.stdout or "").strip() or None
        if r.returncode != 0 and not summary["health_code"]:
            errors.append(f"health_curl: rc={r.returncode} stderr={(r.stderr or '')[:500]}")
    except Exception as e:
        errors.append(f"health_curl: {e}")

    OUT_PATH.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: summary[k] for k in ["boms_ok", "reports_ok", "work_orders_ok", "rebuild_ok", "health_code", "errors"]}), flush=True)
    return 0 if all(summary[k] for k in ["boms_ok", "reports_ok", "work_orders_ok", "rebuild_ok"]) and summary.get("health_code") == "200" else 1

if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
