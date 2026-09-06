"""Emit next N hex CallCLI commands as JSON lines for the agent to submit."""
import json
import pathlib
import sys

root = pathlib.Path(
    r"C:/Users/John Ranel/.cursor/projects/c-Users-John-Ranel-Documents-BluearmERP-bluearmerp-v3-github/agent-tools/hex_cmds"
)
start = int(sys.argv[1])
end = int(sys.argv[2])
for i in range(start, end + 1):
    cmd = (root / f"{i:03d}.cmd").read_text(encoding="utf-8").strip()
    print(json.dumps({"i": i, "len": len(cmd), "command": cmd}, ensure_ascii=False))
