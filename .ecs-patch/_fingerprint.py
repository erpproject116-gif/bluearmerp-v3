import json
import pathlib
import re

args = json.loads(
    pathlib.Path(
        r"C:\Users\John Ranel\.cursor\projects\c-Users-John-Ranel-Documents-BluearmERP-bluearmerp-v3-github\agent-tools\calldynamic_arguments.json"
    ).read_text(encoding="utf-8")
)
s = args["script"]
print("fingerprint", s[:40], "...", s[-40:])
print("newlines", s.count("\n"), "len", len(s))
m1 = re.search(r"SLIP_HEX = '''([0-9a-fA-F]+)'''", s)
m2 = re.search(r"ROUTES_HEX = '''([0-9a-fA-F]+)'''", s)
print("slip_hex_len", len(m1.group(1)) if m1 else None)
print("routes_hex_len", len(m2.group(1)) if m2 else None)
