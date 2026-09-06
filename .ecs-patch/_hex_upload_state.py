"""Orchestrate ECS hex upload via repeated CallCLI using exact cmd files.
Prints next command JSON; agent submits CallCLI then polls.
Also can verify sha of each file.
"""
import hashlib
import json
import pathlib
import sys

ROOT = pathlib.Path(
    r"C:/Users/John Ranel/.cursor/projects/c-Users-John-Ranel-Documents-BluearmERP-bluearmerp-v3-github/agent-tools/hex_cmds"
)
STATE = pathlib.Path(
    r"c:/Users/John Ranel/Documents/BluearmERP/bluearmerp-v3-github/bluearmerp-v3/.ecs-patch/_hex_upload_state.json"
)


def load_state():
    if STATE.exists():
        return json.loads(STATE.read_text(encoding="utf-8"))
    return {"next": 0, "history": []}


def save_state(st):
    STATE.write_text(json.dumps(st, indent=2), encoding="utf-8")


def cmd_for(i: int) -> str:
    return (ROOT / f"{i:03d}.cmd").read_text(encoding="utf-8").strip()


def main():
    op = sys.argv[1] if len(sys.argv) > 1 else "next"
    st = load_state()
    if op == "reset-state":
        st = {"next": 0, "history": []}
        save_state(st)
        print("state reset")
        return
    if op == "mark":
        # mark <i> <invoke_id> <status> <output>
        i = int(sys.argv[2])
        inv = sys.argv[3]
        status = sys.argv[4]
        output = sys.argv[5] if len(sys.argv) > 5 else ""
        st["history"].append({"i": i, "invoke_id": inv, "status": status, "output": output})
        if status == "Success":
            st["next"] = i + 1
        save_state(st)
        print(json.dumps({"next": st["next"], "marked": i, "status": status}))
        return
    if op == "next":
        i = st["next"]
        if i > 34:
            print(json.dumps({"done": True}))
            return
        cmd = cmd_for(i)
        print(
            json.dumps(
                {
                    "i": i,
                    "len": len(cmd),
                    "sha12": hashlib.sha256(cmd.encode()).hexdigest()[:12],
                    "command": cmd,
                }
            )
        )
        return
    if op == "status":
        print(json.dumps(st, indent=2))
        return


if __name__ == "__main__":
    main()
