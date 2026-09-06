import json
import pathlib

base = pathlib.Path(
    r"C:\Users\John Ranel\.cursor\projects\c-Users-John-Ranel-Documents-BluearmERP-bluearmerp-v3-github\agent-tools"
)
head = (
    'r = await call_cli(product="Ecs", action="DescribeRegions", params={})\n'
    'result={"ok":True,"regions":len(r.get("Regions",{}).get("Region",[]))}\n'
    "# "
)
for n in (8000, 16000, 24000, 31787):
    pad_len = max(0, n - len(head))
    script = head + ("x" * pad_len)
    script = script[:n]
    if len(script) < n:
        script += "y" * (n - len(script))
    (base / f"probe_{n}.json").write_text(
        json.dumps({"script": script}), encoding="utf-8"
    )
    print(n, len(script), script.startswith("r = await"))
