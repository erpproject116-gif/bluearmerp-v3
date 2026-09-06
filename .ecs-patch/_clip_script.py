import json
import pathlib
import subprocess
import sys

args_path = pathlib.Path(
    r"C:\Users\John Ranel\.cursor\projects\c-Users-John-Ranel-Documents-BluearmERP-bluearmerp-v3-github\agent-tools\calldynamic_arguments.json"
)
args = json.loads(args_path.read_text(encoding="utf-8"))
script = args["script"]
script_path = pathlib.Path(
    r"C:\Users\John Ranel\.cursor\projects\c-Users-John-Ranel-Documents-BluearmERP-bluearmerp-v3-github\agent-tools\EXACT_SCRIPT.py"
)
script_path.write_text(script, encoding="utf-8", newline="\n")

ps = rf"""
Add-Type -AssemblyName System.Windows.Forms
$t = [IO.File]::ReadAllText('{script_path}')
[Windows.Forms.Clipboard]::SetText($t)
Write-Output ('clip_len=' + $t.Length)
"""
r = subprocess.run(
    ["powershell", "-NoProfile", "-Command", ps],
    capture_output=True,
    text=True,
)
sys.stdout.write(r.stdout)
sys.stderr.write(r.stderr)
raise SystemExit(r.returncode)
