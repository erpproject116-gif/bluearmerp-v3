from __future__ import annotations

import json
import pathlib
import ssl
import sys
import time
import urllib.error
import urllib.request

MCP_URL = "https://openapi-mcp.ap-southeast-1.aliyuncs.com/id/GC6rQufakqkwOHuj/mcp"
TOKEN_PATH = (
    pathlib.Path.home()
    / ".mcp-auth"
    / "mcp-remote-0.1.38"
    / "47f185b1cffefbf96aa243d9a80c53f4_tokens.json"
)
SCRIPT_PATH = pathlib.Path(
    r"c:\Users\John Ranel\Documents\BluearmERP\bluearmerp-v3-github\bluearmerp-v3\.ecs-patch\deploy_bom_msg_rs.py"
)
OUT_PATH = pathlib.Path(
    r"C:\Users\John Ranel\.cursor\projects\c-Users-John-Ranel-Documents-BluearmERP-bluearmerp-v3-github\agent-tools\runscript_http_result.json"
)


def load_tokens() -> dict:
    return json.loads(TOKEN_PATH.read_text(encoding="utf-8"))


def mcp_call(access_token: str, method: str, params: dict, req_id: int = 1) -> dict:
    body = json.dumps(
        {"jsonrpc": "2.0", "id": req_id, "method": method, "params": params},
        ensure_ascii=False,
    ).encode("utf-8")
    req = urllib.request.Request(
        MCP_URL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "Authorization": f"Bearer {access_token}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        return {"httpError": e.code, "body": err_body}
    # SSE or JSON
    if raw.startswith("event:") or "data:" in raw.split("\n", 1)[0:1][0] if False else "data:" in raw:
        data_lines = []
        for line in raw.splitlines():
            if line.startswith("data:"):
                data_lines.append(line[5:].lstrip())
        if data_lines:
            joined = "\n".join(data_lines)
            try:
                return json.loads(joined)
            except json.JSONDecodeError:
                return {"raw": raw}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"raw": raw}


def main() -> int:
    tokens = load_tokens()
    access = tokens.get("access_token")
    if not access:
        print("NO_ACCESS_TOKEN")
        return 2
    script = SCRIPT_PATH.read_text(encoding="utf-8")
    print("script_len", len(script))
    result = mcp_call(
        access,
        "tools/call",
        {
            "name": "AlibabaCloud___RunScript",
            "arguments": {"script": script},
        },
    )
    OUT_PATH.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print("wrote", OUT_PATH)
    # Print compact summary
    if isinstance(result, dict):
        if "result" in result:
            inner = result["result"]
            if isinstance(inner, dict) and "content" in inner:
                for c in inner.get("content", []):
                    if c.get("type") == "text":
                        text = c.get("text", "")
                        print("TEXT_HEAD", text[:1500])
                        try:
                            parsed = json.loads(text)
                            print("processID", parsed.get("processID"))
                            print("status", parsed.get("status"))
                            print("nextAction", parsed.get("nextAction"))
                        except Exception:
                            pass
            else:
                print(json.dumps(inner, ensure_ascii=False)[:2000])
        else:
            print(json.dumps(result, ensure_ascii=False)[:2000])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
