import json
import pathlib

script = pathlib.Path(__file__).with_name("deploy_bom_msg_rs.py").read_text(encoding="utf-8")
args_path = pathlib.Path(__file__).with_name("_mcp_runscript_args.json")
data = json.loads(args_path.read_text(encoding="utf-8"))
assert data["script"] == script
assert "DEPLOY_BOM_MSG_DONE" in script
assert "result = {" in script
print("VERIFIED", len(script))
