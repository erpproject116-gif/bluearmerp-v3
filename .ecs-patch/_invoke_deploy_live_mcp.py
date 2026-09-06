import asyncio
import json
import pathlib
import time

SCRIPT = pathlib.Path(__file__).with_name("_deploy_live_from_git.py").read_text(encoding="utf-8")
OUT = pathlib.Path(__file__).with_name("_deploy_live_runscript_result.json")

async def main():
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

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
            tools = await session.list_tools()
            run_name = next((t.name for t in tools.tools if "RunScript" in t.name), None)
            get_name = next((t.name for t in tools.tools if "GetTask" in t.name), None)
            if not run_name or not get_name:
                print("MISSING_TOOLS", run_name, get_name)
                return 1
            print("CALLING", run_name, "script_len", len(SCRIPT))
            result = await session.call_tool(run_name, {"script": SCRIPT})
            text = ""
            for c in (result.content or []):
                if getattr(c, "text", None):
                    text += c.text
            print("RUN_RESPONSE", text[:2500])
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError:
                OUT.write_text(json.dumps({"raw": text}, indent=2), encoding="utf-8")
                return 1
            process_id = parsed.get("processID")
            final = parsed
            if process_id and parsed.get("nextAction") in ("GetTask", "CallGetTask") or parsed.get("status") in ("Running", "Pending"):
                for i in range(120):
                    await asyncio.sleep(15)
                    tr = await session.call_tool(get_name, {"processID": process_id})
                    ttext = ""
                    for c in (tr.content or []):
                        if getattr(c, "text", None):
                            ttext += c.text
                    try:
                        final = json.loads(ttext)
                    except json.JSONDecodeError:
                        final = {"raw_text": ttext}
                    st = final.get("status")
                    na = final.get("nextAction")
                    print(f"POLL {i+1} status={st} nextAction={na}")
                    if st in ("Success", "Failed", "Expired", "PartialFailed") or na == "Stop":
                        break
                    if na not in ("GetTask", "CallGetTask") and st not in ("Running", "Pending"):
                        break
            OUT.write_text(json.dumps({"initial": parsed, "final": final}, ensure_ascii=False, indent=2), encoding="utf-8")
            print("WROTE", OUT)
            print("FINAL_SNIP", json.dumps(final, ensure_ascii=False)[:12000])
            return 0

if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
