"""Invoke AlibabaCloud___RunScript with exact deploy_bom_msg_rs.py contents via MCP HTTP/SSE if possible."""
import asyncio
import json
import pathlib
import sys

SCRIPT = pathlib.Path(__file__).with_name("deploy_bom_msg_rs.py").read_text(encoding="utf-8")
OUT = pathlib.Path(__file__).with_name("_runscript_result.json")

async def main():
    # Prefer mcp Python SDK ClientSession over stdio if available
    try:
        from mcp import ClientSession
        from mcp.client.stdio import stdio_client
        from mcp import StdioServerParameters
    except Exception as e:
        print("MCP_SDK_UNAVAILABLE", e)
        # Fall back: just print that CallDynamicTool must be used
        pathlib.Path(__file__).with_name("_script_for_mcp.txt").write_text(SCRIPT, encoding="utf-8", newline="\n")
        print("WROTE_SCRIPT_FOR_MCP", len(SCRIPT))
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
            names = [t.name for t in tools.tools]
            print("TOOLS", names)
            # Find RunScript tool name variants
            target = None
            for n in names:
                if "RunScript" in n:
                    target = n
                    break
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
            print("WROTE", OUT, "bytes", OUT.stat().st_size)
            # Print brief preview
            text = ""
            for c in payload["content"]:
                if c.get("text"):
                    text += c["text"]
            print(text[:2000])
            return 0

if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
