"""
Depth-crawl helper for Campaign A (Inv. I Sales + Purchases).
Updates coverage-matrix.csv + appends tab-pills.csv from a JSON evidence file.

Usage:
  python scripts/apply-depth-evidence.py evidence.json

evidence.json schema:
{
  "prgId": "E040202",
  "screen_name": "Quotation List",
  "pills": [{"label": "All", "audited": true}, ...],
  "toolbar": ["New(F2)", "Email", ...],
  "toolbar_audited": ["New(F2)", "Email", ...],  // opened/cancel only
  "controls_logged": 55,
  "coverage_pct": 90,
  "bluearm_route": "/app/quotation/quotations",
  "bluearm_parity": "partial",
  "notes": "...",
  "mark_depth_complete": true
}
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

AUDIT = Path(__file__).resolve().parents[1]
MATRIX = AUDIT / "coverage-matrix.csv"
PILLS = AUDIT / "tab-pills.csv"


def load_matrix() -> list[dict[str, str]]:
    with MATRIX.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def save_matrix(rows: list[dict[str, str]]) -> None:
    if not rows:
        return
    fields = list(rows[0].keys())
    with MATRIX.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)


def append_pills(prg_id: str, screen: str, pills: list[dict], route: str) -> None:
    fields = [
        "tab_id", "prgId", "parent_context", "tab_level", "tab_label", "default_active",
        "fields_summary", "sub_tabs", "toolbar_in_tab", "grid_columns", "posting_effect",
        "bluearm_target", "audited", "notes",
    ]
    with PILLS.open(encoding="utf-8", newline="") as f:
        existing = list(csv.DictReader(f))
    # Normalize rows to known fields only
    keep: list[dict[str, str]] = []
    for r in existing:
        if r.get("prgId") == prg_id and str(r.get("tab_id", "")).startswith(f"{prg_id}-camp-"):
            continue
        keep.append({k: (r.get(k) or "") for k in fields})
    for i, p in enumerate(pills):
        label = p["label"]
        slug = "".join(c if c.isalnum() else "-" for c in label.lower()).strip("-")[:40]
        keep.append({
            "tab_id": f"{prg_id}-camp-{slug}-{i}",
            "prgId": prg_id,
            "parent_context": f"{screen} status/list",
            "tab_level": "L2",
            "tab_label": label,
            "default_active": "yes" if i == 0 else "no",
            "fields_summary": p.get("fields_summary", "list/filter pill"),
            "sub_tabs": "",
            "toolbar_in_tab": "",
            "grid_columns": "",
            "posting_effect": "",
            "bluearm_target": route,
            "audited": "yes" if p.get("audited") else "no",
            "notes": p.get("notes", "Campaign A Jul 28 2026"),
        })
    with PILLS.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(keep)


def main() -> int:
    path = Path(sys.argv[1])
    ev = json.loads(path.read_text(encoding="utf-8"))
    prg = ev["prgId"]
    pills = ev.get("pills") or []
    toolbar = ev.get("toolbar") or []
    audited_tb = set(ev.get("toolbar_audited") or [])
    tb_pct = int(100 * len(audited_tb) / len(toolbar)) if toolbar else 100
    all_pills_ok = bool(pills) and all(p.get("audited") for p in pills)
    mark = bool(ev.get("mark_depth_complete")) and all_pills_ok and tb_pct >= 95

    rows = load_matrix()
    hit = None
    for r in rows:
        if r["prgId"] == prg:
            hit = r
            break
    if not hit:
        print(f"FAIL: prgId {prg} not in matrix")
        return 1

    hit["tab_count"] = str(len(pills))
    hit["tabs_audited"] = str(sum(1 for p in pills if p.get("audited")))
    hit["controls_logged"] = str(ev.get("controls_logged") or hit.get("controls_logged") or "0")
    hit["coverage_pct"] = str(ev.get("coverage_pct") or tb_pct)
    if ev.get("bluearm_route"):
        hit["bluearm_route"] = ev["bluearm_route"]
    if ev.get("bluearm_parity"):
        hit["bluearm_parity"] = ev["bluearm_parity"]
    if ev.get("notes"):
        hit["notes"] = ev["notes"]
    if mark:
        hit["status"] = "depth-complete"
    else:
        hit["status"] = "in-progress"

    append_pills(prg, ev.get("screen_name") or hit.get("screen_name") or prg, pills, hit.get("bluearm_route") or "")
    save_matrix(rows)
    print(f"Updated {prg}: status={hit['status']} tabs={hit['tabs_audited']}/{hit['tab_count']} toolbar_pct={tb_pct} mark={mark}")
    if not all_pills_ok:
        print("  blocked: not all pills audited")
    if tb_pct < 95:
        print(f"  blocked: toolbar {tb_pct}% < 95%")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
