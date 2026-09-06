import asyncio, json, pathlib, subprocess
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
BASE = pathlib.Path(r"c:\Users\John Ranel\Documents\BluearmERP\bluearmerp-v3-github\bluearmerp-v3\.ecs-patch")
script = (BASE / "_deploy_production_split_rebuild.py").read_text(encoding="utf-8")

def parse_text_result(result):
    for c in result.content or []:
        if getattr(c, "type", None) == "text" and getattr(c, "text", None):
            return json.loads(c.text)
    return {}

async def main():
    server = StdioServerParameters(command="npx", args=["mcp-remote-alibaba-cloud", "https://openapi-mcp.ap-southeast-1.aliyuncs.com/id/GC6rQufakqkwOHuj/mcp"])
    async with stdio_client(server) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool("AlibabaCloud___RunScript", {"script": script})
            parsed = parse_text_result(result)
            print("INITIAL", parsed.get("status"), parsed.get("processID"), parsed.get("nextAction"))
            final = parsed
            pid = parsed.get("processID")
            if pid:
                for i in range(240):
                    await asyncio.sleep(5)
                    result = await session.call_tool("AlibabaCloud___GetTask", {"processID": pid})
                    final = parse_text_result(result)
                    st = final.get("status"); na = final.get("nextAction")
                    print(f"POLL {i+1} status={st} nextAction={na}")
                    if st in ("Success","Succeeded","Failed","Expired","PartialFailed","Stopped") and na in (None,"None","Stop","InspectError"):
                        if st in ("Success","Succeeded","Failed","Expired","PartialFailed","Stopped"):
                            break
    ok = final.get("status") in ("Success","Succeeded")
    print("FINAL_OK", ok)
    print(json.dumps(final, ensure_ascii=False)[:8000])
    r = subprocess.run(["curl.exe","-sS","-o","NUL","-w","%{http_code}","https://api.bluearmerp.com/health"], capture_output=True, text=True, timeout=60)
    print("HEALTH", r.stdout.strip())
    return 0 if ok else 1

raise SystemExit(asyncio.run(main()))
