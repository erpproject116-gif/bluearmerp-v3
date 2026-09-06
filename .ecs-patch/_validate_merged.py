import json
import pathlib

args = json.loads(
    pathlib.Path(
        r"C:\Users\John Ranel\.cursor\projects\c-Users-John-Ranel-Documents-BluearmERP-bluearmerp-v3-github\agent-tools\MERGED_ARGS.json"
    ).read_text(encoding="utf-8")
)
s = args["script"]
assert s.startswith("INSTANCE = 'i-t4n5tdhzaktd0x6tc34w'")
assert "DEPLOY_BOM_MSG_DONE" in s
assert s.rstrip().endswith("}")
print("VALID_EXACT_SCRIPT", len(s))
