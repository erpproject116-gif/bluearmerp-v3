import pathlib
path = pathlib.Path(r"c:\Users\John Ranel\Documents\BluearmERP\bluearmerp-v3-github\bluearmerp-v3\.ecs-patch\gen_deploy_mfg_routes_only.py")
text = path.read_text(encoding="utf-8")
text = text.replace("CHUNK = 10000", "CHUNK = 3500")
old = """def upload_phase(f):
    b64 = base64.b64encode((root / f).read_bytes()).decode("ascii")
    dirpath = str(pathlib.Path(f).parent).replace("\\\\", "/")
    parts = [b64[i : i + CHUNK] for i in range(0, len(b64), CHUNK)]
    lines = ["set -e", "cd /root/bluearmerp-v3", f"mkdir -p {dirpath}", "rm -f /tmp/_upload.b64"]
    for part in parts:
        safe = part.replace("'", "'\\''")
        lines.append(f"printf '%s' '{safe}' >> /tmp/_upload.b64")
    lines.extend([f"base64 -d /tmp/_upload.b64 > {f}", "rm -f /tmp/_upload.b64", f"echo UPLOADED_{pathlib.Path(f).name}"])
    return "\\n".join(lines)"""
new = """def upload_phases(f):
    b64 = base64.b64encode((root / f).read_bytes()).decode("ascii")
    dirpath = str(pathlib.Path(f).parent).replace("\\\\", "/")
    name = pathlib.Path(f).name
    parts = [b64[i : i + CHUNK] for i in range(0, len(b64), CHUNK)]
    phases = []
    for i, part in enumerate(parts):
        lines = ["set -e", "cd /root/bluearmerp-v3", f"mkdir -p {dirpath}"]
        if i == 0:
            lines.append("rm -f /tmp/_upload.b64")
        safe = part.replace("'", "'\\''")
        lines.append(f"printf '%s' '{safe}' >> /tmp/_upload.b64")
        if i == len(parts) - 1:
            lines.extend([f"base64 -d /tmp/_upload.b64 > {f}", "rm -f /tmp/_upload.b64", f"echo UPLOADED_{name}"])
        else:
            lines.append(f"echo CHUNK_{name}_{i}")
        phases.append("\\n".join(lines))
    return phases"""
if old not in text:
    raise SystemExit("pattern not found")
text = text.replace(old, new)
text = text.replace(
    "phases = [upload_phase(f) for f in files] + [rebuild_phase]",
    "phases = []\nfor f in files:\n    phases.extend(upload_phases(f))\nphases.append(rebuild_phase)",
)
path.write_text(text, encoding="utf-8", newline="\n")
print("patched gen")
