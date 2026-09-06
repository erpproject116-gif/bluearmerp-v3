"""Invoke AlibabaCloud___RunScript for partner fix deploy."""
import asyncio
import json
import pathlib

SCRIPT = pathlib.Path(__file__).with_name("_deploy_partner_fix_script.py").read_text(encoding="utf-8")
OUT = pathlib.Path(__file__).with_name("_partner_fix_runscript_result.json")

async def main():
    try:
        from mcp import ClientSession
        from mcp.client.stdio import stdio_client
        from mcp import StdioServerParameters
    except Exception as e:
        print("MCP_SDK_UNAVAILABLE", e)
        return 2

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
            target = next((t.name for t in tools.tools if "RunScript" in t.name), None)
            if not target:
                print("NO_RUNSCRIPT")
                return 1
            print("CALLING", target, "script_len", len(SCRIPT))
            result = await session.call_tool(target, {"script": SCRIPT})
            payload = {
                "content": [
                    (c.model_dump() if hasattr(c, "model_dump") else {"type": getattr(c, "type", None), "text": getattr(c, "text", str(c))})
                    for c in (result.content or [])
                ],
                "isError": getattr(result, "isError", None),
                "structuredContent": getattr(result, "structuredContent", None),
            }
            OUT.write_text(json.dumps(payload, ensure_ascii=False, default=str), encoding="utf-8")
            print("WROTE", OUT)
            for c in payload["content"]:
                if c.get("text"):
                    print(c["text"][:4000])
            return 0

if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
