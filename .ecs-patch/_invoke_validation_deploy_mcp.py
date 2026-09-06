"""Write deploy script for MCP RunScript invocation."""
import pathlib

SCRIPT = pathlib.Path(__file__).with_name("_deploy_validation_upload.py").read_text(encoding="utf-8")
OUT = pathlib.Path(__file__).with_name("_script_validation_deploy.txt")
OUT.write_text(SCRIPT, encoding="utf-8", newline="\n")
print("WROTE", OUT, "chars", len(SCRIPT))
