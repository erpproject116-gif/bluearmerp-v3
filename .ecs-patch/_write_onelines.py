from pathlib import Path

base = Path(__file__).resolve().parent
for name in ["full3.b64", "phaseC2.b64", "full1.b64", "full2.b64"]:
    src = (base / name).read_text(encoding="utf-8").strip()
    (base / f"_{name}.oneline").write_text(src, encoding="utf-8", newline="\n")
    print(name, "wrote", len(src))
