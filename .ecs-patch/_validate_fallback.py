from pathlib import Path
import json
import hashlib

base = Path(__file__).resolve().parent
script = (base / "_run_cli_fallback.py").read_text(encoding="utf-8")
payload = {"script": script}
out = base / "_runscript_arg.json"
out.write_text(json.dumps(payload), encoding="utf-8")
print("json_bytes", out.stat().st_size)
print("script_lines", script.count("\n") + 1)
for name in ["full1.b64", "full2.b64", "full3.b64", "phaseC2.b64"]:
    f = (base / name).read_text(encoding="utf-8").strip()
    print(name, "embedded", f in script, "len", len(f), "md5", hashlib.md5(f.encode()).hexdigest())
