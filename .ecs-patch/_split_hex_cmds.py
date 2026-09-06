import pathlib
import re

src = pathlib.Path(__file__).with_name("deploy_mfg_rs.py").read_text(encoding="utf-8")
m = re.search(r"HEX = '''([0-9a-fA-F]+)'''", src, re.S)
if not m:
    raise SystemExit("HEX not found")
hexdata = m.group(1)
print("hex_len", len(hexdata))
out = pathlib.Path(__file__).resolve().parent / "_hex_chunks"
out.mkdir(exist_ok=True)
# clear dir files
for p in out.glob("*"):
    p.unlink()
chunk = 1800
cmds = []
cmds.append("rm -f /tmp/mfg-main.hex\necho RESET")
for i in range(0, len(hexdata), chunk):
    part = hexdata[i : i + chunk]
    cmds.append(f"printf '%s' '{part}' >> /tmp/mfg-main.hex\necho C{i}")
# FINISH from deploy script
fm = re.search(r'FINISH = """(.*?)"""', src, re.S)
if not fm:
    raise SystemExit("FINISH not found")
finish = fm.group(1)
cmds.append(finish)
for i, cmd in enumerate(cmds):
    # For CallCLI PlainText, pass CommandContent as the shell script itself
    # Escape not needed if we use Base64 for the shell script
    import base64

    b64 = base64.b64encode(cmd.encode("utf-8")).decode("ascii")
    timeout = 900 if i == len(cmds) - 1 else 120
    aliyun = (
        "aliyun ecs RunCommand --RegionId ap-southeast-1 --Type RunShellScript "
        f"--InstanceId.1 i-t4n5tdhzaktd0x6tc34w --ContentEncoding Base64 "
        f"--Timeout {timeout} --CommandContent {b64}"
    )
    (out / f"cmd_{i:03d}.txt").write_text(aliyun, encoding="ascii", newline="")
    (out / f"cmd_{i:03d}.meta").write_text(
        f"i={i} timeout={timeout} plain_len={len(cmd)} b64_len={len(b64)}\n",
        encoding="utf-8",
    )
print("chunks", len(cmds))
print("max_cmd_len", max(len((out / f"cmd_{i:03d}.txt").read_text()) for i in range(len(cmds))))
print("outdir", out)
