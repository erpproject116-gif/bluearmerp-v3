import csv
from collections import Counter
from pathlib import Path

rows = list(csv.DictReader(open(Path(__file__).parent.parent / "coverage-matrix.csv", encoding="utf-8")))
tgt = [r for r in rows if r["menu_path_l1"] == "Inv. I" and r["menu_path_l2"] in ("Sales", "Purchases")]
print("TARGET", len(tgt))
print("status", Counter(r["status"] for r in tgt))
print("parity", Counter(r["bluearm_parity"] for r in tgt))
dc = sum(1 for r in tgt if r["status"] == "depth-complete")
p1 = [r for r in tgt if r.get("gap_priority") == "P1"]
p1_miss = sum(1 for r in p1 if r["bluearm_parity"] == "missing")
print("P1", len(p1), "P1_missing", p1_miss, "depth_complete", dc)
out = Path(__file__).parent.parent / "campaigns" / "inv1-sales-purchases-g2g3.md"
out.parent.mkdir(exist_ok=True)
lines = [
    "# Campaign A — Inv. I Sales + Purchases (G2 then G3)",
    "",
    f"_Generated inventory. Target rows: **{len(tgt)}**._",
    "",
    "## Gate rules for this campaign",
    "",
    "- **G2 PASS (scope):** every row below is `depth-complete` (all pills audited, toolbar >=95%).",
    "- **G3 PASS (scope):** every P1 row is `parity` | `partial`+residual | `deferred`+reason — **0 silent missing**.",
    "- Do not implement residuals until G2+G3 pass for this scope.",
    "",
    "### Progress tracker",
    "",
    "| Date | depth-complete | still open | P1 silent missing |",
    "|------|---------------:|-----------:|------------------:|",
    f"| Jul 28 batch 1 | {dc} / {len(tgt)} | {len(tgt)-dc} | {p1_miss} |",
    "",
    "| status | count |",
    "|--------|------:|",
]
for k, v in Counter(r["status"] for r in tgt).most_common():
    lines.append(f"| {k} | {v} |")
lines += ["", f"| bluearm_parity | count |", "|----------------|------:|"]
for k, v in Counter(r["bluearm_parity"] for r in tgt).most_common():
    lines.append(f"| {k} | {v} |")
lines += [
    "",
    f"**P1 rows:** {len(p1)} · **P1 silent missing:** {sum(1 for r in p1 if r['bluearm_parity']=='missing')}",
    "",
    "## Work queue (not depth-complete)",
    "",
    "| prgId | L2 | screen | status | parity | pri | tabs |",
    "|-------|----|--------|--------|--------|-----|------|",
]
for r in sorted(tgt, key=lambda x: (x["menu_path_l2"], x["screen_name"], x["prgId"])):
    if r["status"] == "depth-complete":
        continue
    lines.append(
        f"| {r['prgId']} | {r['menu_path_l2']} | {r['screen_name']} | {r['status']} | "
        f"{r['bluearm_parity']} | {r['gap_priority']} | {r['tabs_audited']}/{r['tab_count']} |"
    )
out.write_text("\n".join(lines) + "\n", encoding="utf-8")
print("Wrote", out)
