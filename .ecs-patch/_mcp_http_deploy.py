"""Refresh Alibaba MCP OAuth and run tools/call with exact local script file."""
from __future__ import annotations

import json
import pathlib
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


def load_tokens() -> dict:
    return json.loads(TOKEN_PATH.read_text(encoding="utf-8"))


def save_tokens(data: dict) -> None:
    TOKEN_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")


def http_json(url: str, headers: dict, body: dict | None = None) -> tuple[int, dict | str]:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST" if body is not None else "GET")
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            try:
                return resp.status, json.loads(raw)
            except json.JSONDecodeError:
                return resp.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, raw


def try_refresh(tokens: dict) -> dict | None:
    # mcp-remote typically uses standard OAuth refresh against provider.
    # Try common Alibaba OpenAPI MCP token endpoint patterns; fall back to None.
    refresh = tokens.get("refresh_token")
    if not refresh:
        return None
    candidates = [
        "https://oauth.aliyun.com/v1/token",
        "https://openapi-mcp.ap-southeast-1.aliyuncs.com/oauth/token",
        "https://openapi-mcp.ap-southeast-1.aliyuncs.com/id/GC6rQufakqkwOHuj/oauth/token",
    ]
    for url in candidates:
        for body in (
            {"grant_type": "refresh_token", "refresh_token": refresh},
            f"grant_type=refresh_token&refresh_token={refresh}",
        ):
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            data = body
            if isinstance(body, str):
                headers["Content-Type"] = "application/x-www-form-urlencoded"
                data = body.encode()
                req = urllib.request.Request(url, data=data, headers=headers, method="POST")
                try:
                    with urllib.request.urlopen(req, timeout=30) as resp:
                        raw = resp.read().decode()
                        print("REFRESH_OK", url, raw[:200])
                        return json.loads(raw)
                except Exception as e:
                    print("REFRESH_FAIL", url, type(body).__name__, e)
            else:
                code, resp = http_json(url, headers, body)
                print("REFRESH_TRY", url, code, str(resp)[:200])
                if code == 200 and isinstance(resp, dict) and "access_token" in resp:
                    return resp
    return None


def mcp_call(access_token: str, name: str, arguments: dict, req_id: int = 1) -> tuple[int, object]:
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }
    body = {
        "jsonrpc": "2.0",
        "id": req_id,
        "method": "tools/call",
        "params": {"name": name, "arguments": arguments},
    }
    return http_json(MCP_URL, headers, body)


def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else "probe"
    tokens = load_tokens()
    print("token_path", TOKEN_PATH)
    print("has_refresh", "refresh_token" in tokens, "access_len", len(tokens.get("access_token", "")))

    if mode == "refresh":
        refreshed = try_refresh(tokens)
        if not refreshed:
            print("NO_REFRESH")
            return 2
        tokens.update(refreshed)
        if "expires_in" in refreshed and "expires_at" not in refreshed:
            tokens["expires_at"] = int(time.time() * 1000) + int(refreshed["expires_in"]) * 1000
        save_tokens(tokens)
        print("SAVED")
        return 0

    access = tokens["access_token"]
    if mode == "probe":
        code, resp = mcp_call(access, "AlibabaCloud___CallCLI", {"command": "aliyun ecs DescribeRegions --RegionId ap-southeast-1"})
        print("PROBE", code, str(resp)[:500])
        return 0 if code == 200 else 1

    if mode == "runscript":
        path = pathlib.Path(sys.argv[2])
        script = path.read_text(encoding="utf-8")
        print("script_len", len(script), "path", path)
        code, resp = mcp_call(access, "AlibabaCloud___RunScript", {"script": script})
        out = pathlib.Path(sys.argv[3]) if len(sys.argv) > 3 else path.with_suffix(".out.json")
        out.write_text(json.dumps({"http": code, "resp": resp}, indent=2, default=str), encoding="utf-8")
        print("WROTE", out, "http", code)
        return 0 if code == 200 else 1

    if mode == "callcli-file":
        path = pathlib.Path(sys.argv[2])
        command = path.read_text(encoding="utf-8").strip()
        print("cmd_len", len(command))
        code, resp = mcp_call(access, "AlibabaCloud___CallCLI", {"command": command})
        out = pathlib.Path(sys.argv[3]) if len(sys.argv) > 3 else path.with_suffix(".out.json")
        out.write_text(json.dumps({"http": code, "resp": resp}, indent=2, default=str), encoding="utf-8")
        print("WROTE", out, "http", code)
        return 0 if code == 200 else 1

    print("unknown mode")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
