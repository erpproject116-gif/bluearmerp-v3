import json
import pathlib
import time
import urllib.error
import urllib.request

p = pathlib.Path(
    r"C:\Users\John Ranel\.mcp-auth\mcp-remote-v1\1a0b27755e4117df2cd8aadfe1502a69_tokens.json"
)
t = json.loads(p.read_text(encoding="utf-8"))
now = time.time()
exp = t["expires_at"]
exp_s = exp / 1000 if exp > 1e12 else exp
print("valid", exp_s > now, "left_h", (exp_s - now) / 3600)
token = t["access_token"]
url = "https://openapi-mcp.ap-southeast-1.aliyuncs.com/id/GC6rQufakqkwOHuj/mcp"
body = json.dumps(
    {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": "AlibabaCloud___CallCLI",
            "arguments": {
                "command": "aliyun ecs DescribeRegions --RegionId ap-southeast-1"
            },
        },
    }
).encode()
req = urllib.request.Request(
    url,
    data=body,
    headers={
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "Authorization": f"Bearer {token}",
    },
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=60) as resp:
        print("status", resp.status)
        print("ctype", resp.headers.get("Content-Type"))
        raw = resp.read().decode("utf-8", errors="replace")
        print(raw[:1500])
except urllib.error.HTTPError as e:
    print("HTTP", e.code)
    print(e.read().decode("utf-8", errors="replace")[:1500])
except Exception as e:
    print("ERR", type(e).__name__, e)
