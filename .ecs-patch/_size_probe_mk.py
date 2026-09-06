import json
import pathlib

pad = "x" * 31000
script = (
    'r = await call_cli(product="Ecs", action="DescribeRegions", params={})\n'
    'result = {"ok": True, "n": len(r.get("Regions", {}).get("Region", [])), '
    f'"pad_len": {len(pad)}}\n'
    f"# {pad}"
)
p = pathlib.Path(
    r"C:\Users\John Ranel\.cursor\projects\c-Users-John-Ranel-Documents-BluearmERP-bluearmerp-v3-github\agent-tools\size_probe.json"
)
p.write_text(json.dumps({"script": script}), encoding="utf-8")
print(len(script), p.stat().st_size)
