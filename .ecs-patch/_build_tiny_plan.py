"""Drive CallCLI hex-chunk deploy via Cursor is hard; instead print a compact
RunScript that only embeds HEX and uses call_cli — same as deploy_mfg_rs.py.
Also build a streaming uploader that uses many tiny PlainText CallCLI commands
returned as a JSON list the agent can iterate.
"""
import base64
import json
import pathlib
import re

patch = pathlib.Path(__file__).resolve().parent
src = (patch / "deploy_mfg_rs.py").read_text(encoding="utf-8")
hexdata = re.search(r"HEX = '''([0-9a-fA-F]+)'''", src, re.S).group(1)
finish = re.search(r'FINISH = """(.*?)"""', src, re.S).group(1)

# Prefer the prepared mfgpart payloads: emit tiny PlainText upload of those b64 strings
# in 800-char chunks so CallCLI args stay small and copy-safe.
plan = []
plan.append(
    {
        "name": "reset_b64",
        "timeout": 120,
        "plain": "rm -f /tmp/mfg-main.b64 /tmp/mfg-main.tgz\necho RESET_B64",
    }
)
for part_name in [
    "mfgpart0.b64",
    "mfgpart1.b64",
    "mfgpart2.b64",
    "mfgpart3.b64",
    "mfgpart4.b64",
]:
    # Each file is already a base64-encoded shell script that appends to mfg-main.b64.
    # Instead of sending the whole script, decode and re-emit as small append chunks
    # of the DATA portion only after a shared reset — actually simplest is to run
    # decoded scripts via PlainText in pieces: upload the decoded script text in chunks
    # to /tmp/runpart.sh then bash it.
    raw_b64 = (patch / part_name).read_text(encoding="utf-8").strip()
    decoded = base64.b64decode(raw_b64).decode("utf-8")
    # Upload decoded script to a temp file in 700-char chunks (printf-safe: no quotes in our payload?)
    # Our decoded scripts contain single quotes in printf '%s' '...' — cannot PlainText easily.
    # So keep Base64 CommandContent but split the *b64 file itself* onto the server, then:
    #   base64 -d /tmp/part.b64 | bash
    safe = part_name.replace(".", "_")
    plan.append(
        {
            "name": f"{safe}_clear",
            "timeout": 120,
            "plain": f"rm -f /tmp/{safe}.b64\necho CLEAR_{safe}",
        }
    )
    chunk = 700
    for i in range(0, len(raw_b64), chunk):
        piece = raw_b64[i : i + chunk]
        # piece is base64 alphabet only — safe inside single quotes
        plan.append(
            {
                "name": f"{safe}_c{i}",
                "timeout": 120,
                "plain": f"printf '%s' '{piece}' >> /tmp/{safe}.b64\necho {safe}_C{i}",
            }
        )
    plan.append(
        {
            "name": f"{safe}_exec",
            "timeout": 120,
            "plain": f"base64 -d /tmp/{safe}.b64 | bash\necho EXEC_{safe}",
        }
    )

# build step: upload mfgbuild.b64 the same way then exec
raw_build = (patch / "mfgbuild.b64").read_text(encoding="utf-8").strip()
plan.append({"name": "build_clear", "timeout": 120, "plain": "rm -f /tmp/mfgbuild_b64.b64\necho CLEAR_BUILD"})
chunk = 700
for i in range(0, len(raw_build), chunk):
    piece = raw_build[i : i + chunk]
    plan.append(
        {
            "name": f"build_c{i}",
            "timeout": 120,
            "plain": f"printf '%s' '{piece}' >> /tmp/mfgbuild_b64.b64\necho BUILD_C{i}",
        }
    )
plan.append(
    {
        "name": "build_exec",
        "timeout": 900,
        "plain": "base64 -d /tmp/mfgbuild_b64.b64 | bash\necho EXEC_BUILD",
    }
)

out_dir = patch / "_tiny_plan"
out_dir.mkdir(exist_ok=True)
for p in out_dir.glob("*"):
    p.unlink()

commands = []
for idx, step in enumerate(plan):
    b64 = base64.b64encode(step["plain"].encode("utf-8")).decode("ascii")
    cmd = (
        "aliyun ecs RunCommand --RegionId ap-southeast-1 --Type RunShellScript "
        f"--InstanceId.1 i-t4n5tdhzaktd0x6tc34w --ContentEncoding Base64 "
        f"--Timeout {step['timeout']} --CommandContent {b64}"
    )
    (out_dir / f"step_{idx:03d}.cmd").write_text(cmd, encoding="ascii", newline="")
    (out_dir / f"step_{idx:03d}.meta").write_text(
        json.dumps({"idx": idx, **{k: step[k] for k in ("name", "timeout")}, "cmd_len": len(cmd)}, indent=2),
        encoding="utf-8",
    )
    commands.append({"idx": idx, "name": step["name"], "timeout": step["timeout"], "cmd_len": len(cmd)})

summary = {"steps": len(commands), "max_cmd_len": max(c["cmd_len"] for c in commands), "commands": commands}
(out_dir / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
print(json.dumps(summary, indent=2)[:2000])
print("max_cmd_len", summary["max_cmd_len"])
print("steps", summary["steps"])
