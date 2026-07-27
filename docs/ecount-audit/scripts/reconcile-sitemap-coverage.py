#!/usr/bin/env python3
"""
Gate G0/G1 helper: ensure every Site Map prgId has a coverage-matrix row,
and every row has bluearm_parity + deferred_reason columns.

Usage:
  python reconcile-sitemap-coverage.py           # write matrix + print scorecard
  python reconcile-sitemap-coverage.py --dry-run # report only
  python reconcile-sitemap-coverage.py --check   # exit 1 if G0 fails (for CI)
"""
from __future__ import annotations

import csv
import re
import sys
from collections import Counter
from pathlib import Path

AUDIT = Path(__file__).resolve().parents[1]
MATRIX = AUDIT / "coverage-matrix.csv"
SITEMAP = AUDIT / "site-map-prgids.csv"
SCORECARD = AUDIT / "scorecard.md"
DEFERRED = AUDIT / "deferred-register.md"

FIELDNAMES = [
    "prgId",
    "menu_path_l1",
    "menu_path_l2",
    "menu_path_l3",
    "screen_name",
    "screen_type",
    "tab_count",
    "tabs_audited",
    "status",
    "controls_logged",
    "coverage_pct",
    "bluearm_route",
    "bluearm_parity",
    "deferred_reason",
    "gap_priority",
    "notes",
]

# Heuristic route seeds for common hubs / known Bluearm paths
ROUTE_HINTS: dict[str, str] = {
    "C000029": "/app/inventory/items",
    "C000030": "/app/sales/sales",
    "C000031": "/app/purchases/purchases",
    "C000032": "/app/inventory/goods-receipts",
    "C000033": "/app/inventory/stock-movements",
    "C000035": "/app/reports",
    "C000001": "/app/finance/reports",
    "C000004": "/app/inventory",
    "C000005": "/app/finance/acct-ii",
    "C000092": "/app/inventory/serial-lot",
    "E040203": "/app/sales-order/sales-orders/new",
    "E040205": "/app/sales/sales/new",
    "E040301": "/app/purchase-order/purchase-orders/new",
    "E040303": "/app/purchases/purchases/new",
    "E010404": "/app/finance/cash/receipts",
    "E010409": "/app/finance/cash/payments",
    "E010201": "/app/finance/journal",
    "E010403": "/app/finance/cash/receipts",
    "E010408": "/app/finance/cash/payments",
    "E010505": "/app/finance/journal",
}

# Programs / trees we deliberately defer (Mgmt, GW, Data Center, User Customization hubs)
DEFER_L1 = {
    "Mgmt": "Deferred — Mgmt/HR clone out of current IA wave; see deferred-register.md",
    "GW": "Deferred — Groupware not in Bluearm Computer Store scope; see deferred-register.md",
    "Data Center": "Deferred — import/integration hub; use Bluearm CSV/import tools; see deferred-register.md",
    "User Customization": "Deferred — Ecount personalization; Bluearm uses branding + permissions",
    "MyPage": "Mapped to Bluearm Home /app/dashboard (MyPage widgets)",
}

DONE_NOTE_RE = re.compile(r"\bDone\b|\*\*Done\*\*|parity", re.I)


def infer_l1(label: str, prg_id: str, menu_seq: str) -> str:
    seq = (menu_seq or "").upper()
    low = label.lower()
    if "MENUTREE_000004" in seq or prg_id in ("C000004", "C000029", "C000030", "C000031", "C000032", "C000033", "C000035", "C000654"):
        return "Inv. I"
    if "MENUTREE_000006" in seq or prg_id.startswith("C00009") or "serial" in low or "wms" in low or "qc" in low or "costing" in low:
        if prg_id.startswith("E0406") or prg_id.startswith("E0409") or "serial" in low or "lot" in low:
            return "Inv. II"
    if "MENUTREE_000001" in seq or prg_id in ("C000001", "C000010") or prg_id.startswith("E010"):
        return "Acct. I"
    if "MENUTREE_000005" in seq or prg_id in ("C000005", "C000125", "C000126") or prg_id.startswith("E060"):
        return "Acct. II"
    if "MENUTREE_000007" in seq or prg_id == "C000007":
        return "GW"
    if "payroll" in low or "hr" in low or prg_id.startswith("E07") or "MENUTREE_000003" in seq:
        return "Mgmt"
    if "data center" in low or "import" in low or "MENUTREE_000009" in seq and "setup" not in low:
        if "data" in low:
            return "Data Center"
    if prg_id.startswith("E0402") or prg_id.startswith("E0403") or prg_id.startswith("E0404") or prg_id.startswith("E0405") or prg_id.startswith("E041"):
        return "Inv. I"
    if prg_id.startswith("E0406") or prg_id.startswith("E0409"):
        return "Inv. II"
    if prg_id.startswith("E010"):
        return "Acct. I"
    if prg_id.startswith("E060"):
        return "Acct. II"
    if "mypage" in low or prg_id.startswith("831"):
        return "MyPage"
    if "custom" in low:
        return "User Customization"
    return "Inv. I"


def infer_screen_type(label: str) -> str:
    low = label.lower()
    if any(x in low for x in ("status", "aging", "balance", "report", "book", "ledger", "summary", "fluctuation")):
        return "report"
    if low.startswith("new") or "journal" in low:
        return "form"
    if "list" in low or "registry" in low:
        return "list"
    if "hub" in low or label in ("Inv. I", "Acct. I", "Acct. II", "Setup", "Sales", "Purchases", "Reports"):
        return "hub"
    return "other"


def infer_parity(route: str, status: str, notes: str, l1: str) -> tuple[str, str]:
    """Return (bluearm_parity, deferred_reason)."""
    if l1 in DEFER_L1 and l1 not in ("MyPage",):
        return "deferred", DEFER_L1[l1]
    if l1 == "MyPage":
        return "partial", ""
    if l1 == "User Customization":
        return "deferred", DEFER_L1["User Customization"]
    route = (route or "").strip()
    notes = notes or ""
    if route in ("", "—", "-"):
        if l1 in ("Mgmt", "GW", "Data Center"):
            return "deferred", DEFER_L1.get(l1, "Deferred — out of current wave")
        return "missing", ""
    if status == "depth-complete" and DONE_NOTE_RE.search(notes):
        return "partial", ""
    if "parity" in notes.lower() and "not" not in notes.lower():
        return "partial", ""
    # Has a concrete /app route → at least partial mapping intent
    if route.startswith("/app/"):
        if status == "cataloged":
            return "missing", ""  # route guessed or placeholder may be wrong — keep conservative for new stubs
        return "partial", ""
    return "missing", ""


def stub_row(prg_id: str, label: str, menu_seq: str) -> dict[str, str]:
    l1 = infer_l1(label, prg_id, menu_seq)
    route = ROUTE_HINTS.get(prg_id, "—")
    parity, reason = infer_parity(route, "cataloged", "", l1)
    # Fresh Site Map stubs without route stay missing unless deferred
    if route == "—" and parity == "partial":
        parity = "missing"
    if l1 in DEFER_L1 and l1 not in ("MyPage",):
        parity, reason = "deferred", DEFER_L1[l1]
    priority = "P3"
    if l1 in ("Inv. I", "Inv. II"):
        priority = "P2"
    if l1 in ("Acct. I", "Acct. II"):
        priority = "P2"
    if any(x in label.lower() for x in ("sales", "purchase", "quotation", "order", "receipt", "payment")):
        priority = "P1"
    return {
        "prgId": prg_id,
        "menu_path_l1": l1,
        "menu_path_l2": label,
        "menu_path_l3": "",
        "screen_name": label,
        "screen_type": infer_screen_type(label),
        "tab_count": "0",
        "tabs_audited": "0",
        "status": "cataloged",
        "controls_logged": "0",
        "coverage_pct": "0",
        "bluearm_route": route,
        "bluearm_parity": parity,
        "deferred_reason": reason,
        "gap_priority": priority,
        "notes": f"G0 catalog stub from Site Map Jul 2026; menuSeq={menu_seq}",
    }


def normalize_existing(row: dict[str, str]) -> dict[str, str]:
    out = {k: (row.get(k) or "").strip() for k in FIELDNAMES}
    # Preserve unknown extra keys only if needed — we rewrite to FIELDNAMES
    for k in FIELDNAMES:
        if k not in row and k not in ("bluearm_parity", "deferred_reason"):
            out[k] = row.get(k, "")
    l1 = out.get("menu_path_l1") or "Inv. I"
    route = out.get("bluearm_route") or "—"
    status = out.get("status") or "cataloged"
    notes = out.get("notes") or ""
    if not out.get("bluearm_parity"):
        parity, reason = infer_parity(route, status, notes, l1)
        out["bluearm_parity"] = parity
        if not out.get("deferred_reason"):
            out["deferred_reason"] = reason
    elif out["bluearm_parity"] == "deferred" and not out.get("deferred_reason"):
        out["deferred_reason"] = DEFER_L1.get(l1, "Deferred — see deferred-register.md")
    return out


def load_matrix() -> list[dict[str, str]]:
    with MATRIX.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def load_sitemap() -> list[dict[str, str]]:
    with SITEMAP.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def write_scorecard(
    sitemap_n: int,
    matrix_n: int,
    missing: int,
    extra: int,
    status_counts: Counter,
    parity_counts: Counter,
) -> None:
    g0 = "PASS" if missing == 0 else "FAIL"
    lines = [
        "# Ecount audit scorecard",
        "",
        f"_Generated by `scripts/reconcile-sitemap-coverage.py`. Do not claim module/product complete without gates G0–G3 (and G4 for shell)._",
        "",
        "## Gate snapshot",
        "",
        f"| Gate | Status | Detail |",
        f"|------|--------|--------|",
        f"| G0 Universe | **{g0}** | Site Map unique={sitemap_n}; coverage={matrix_n}; missing={missing}; extra={extra} |",
        f"| G1 Catalog quality | **PASS columns** | Every row has `bluearm_parity`; deferred rows use `deferred_reason` |",
        f"| G2 Depth | FAIL until module rows are depth-complete | status counts below |",
        f"| G3 Parity ops | measurable via bluearm_parity | parity counts below |",
        "",
        "## Coverage status",
        "",
        "| status | count |",
        "|--------|------:|",
    ]
    for k, v in status_counts.most_common():
        lines.append(f"| {k or '(empty)'} | {v} |")
    lines += [
        "",
        "## Bluearm parity",
        "",
        "| bluearm_parity | count |",
        "|----------------|------:|",
    ]
    for k, v in parity_counts.most_common():
        lines.append(f"| {k or '(empty)'} | {v} |")
    lines += [
        "",
        "## Honest language",
        "",
        "- Say: `G0 closed: 0 Site Map orphans` when missing=0.",
        "- Never say: audit complete / nothing can be missed without gate numbers.",
        "",
    ]
    SCORECARD.write_text("\n".join(lines), encoding="utf-8")


def write_deferred_register(rows: list[dict[str, str]]) -> None:
    deferred = [r for r in rows if r.get("bluearm_parity") == "deferred"]
    by_l1: dict[str, list[dict[str, str]]] = {}
    for r in deferred:
        by_l1.setdefault(r.get("menu_path_l1") or "?", []).append(r)
    lines = [
        "# Deferred register (explicit skips)",
        "",
        "Programs deliberately out of the current Bluearm Computer Store IA wave.",
        "Each row must have `bluearm_parity=deferred` and a non-empty `deferred_reason` in coverage-matrix.csv.",
        "",
        f"Total deferred: **{len(deferred)}**",
        "",
    ]
    for l1, items in sorted(by_l1.items()):
        lines.append(f"## {l1} ({len(items)})")
        lines.append("")
        lines.append("| prgId | screen | reason |")
        lines.append("|-------|--------|--------|")
        for r in sorted(items, key=lambda x: x.get("prgId") or "")[:80]:
            reason = (r.get("deferred_reason") or "")[:80]
            lines.append(f"| {r.get('prgId')} | {r.get('screen_name')} | {reason} |")
        if len(items) > 80:
            lines.append(f"| … | _{len(items) - 80} more_ | see coverage-matrix.csv |")
        lines.append("")
    lines += [
        "## Revisit",
        "",
        "- Owner: product",
        "- Revisit when: Computer Store daily ops (Inv/Acct) reach module-complete gates",
        "",
    ]
    DEFERRED.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    dry = "--dry-run" in sys.argv
    check = "--check" in sys.argv

    site = load_sitemap()
    matrix = load_matrix()
    existing = {r["prgId"]: r for r in matrix if r.get("prgId")}
    site_ids = {r["prgId"] for r in site if r.get("prgId")}

    missing_ids = sorted(site_ids - set(existing))
    extra_ids = sorted(set(existing) - site_ids)

    if check:
        # Validate on-disk matrix vs Site Map (do not treat in-memory stubs as pass).
        if missing_ids:
            print(f"CHECK FAIL: G0 missing={len(missing_ids)} (run reconcile without --check)")
            sys.exit(1)
        if any(not (r.get("bluearm_parity") or "").strip() for r in matrix):
            print("CHECK FAIL: G1 — empty bluearm_parity on one or more rows")
            sys.exit(1)
        print(f"CHECK PASS: G0 + G1 (coverage={len(matrix)}, sitemap={len(site_ids)}, extra={len(extra_ids)})")
        sys.exit(0)

    new_stubs = []
    for row in site:
        pid = row.get("prgId") or ""
        if pid in existing:
            continue
        new_stubs.append(stub_row(pid, (row.get("menu_label") or "").strip() or pid, row.get("menuSeq") or ""))

    normalized = [normalize_existing(r) for r in matrix]
    # Re-key
    by_id = {r["prgId"]: r for r in normalized}
    for s in new_stubs:
        by_id[s["prgId"]] = s

    # Stable order: existing order first, then new stubs by prgId
    ordered: list[dict[str, str]] = []
    seen: set[str] = set()
    for r in matrix:
        pid = r.get("prgId") or ""
        if pid and pid in by_id and pid not in seen:
            ordered.append(by_id[pid])
            seen.add(pid)
    for s in sorted(new_stubs, key=lambda x: x["prgId"]):
        if s["prgId"] not in seen:
            ordered.append(s)
            seen.add(s["prgId"])

    status_counts = Counter(r.get("status") or "" for r in ordered)
    parity_counts = Counter(r.get("bluearm_parity") or "" for r in ordered)

    print(f"Site Map unique: {len(site_ids)}")
    print(f"Coverage before: {len(matrix)}; after: {len(ordered)}")
    print(f"G0 missing (to add): {len(missing_ids)}")
    print(f"Extra in coverage (not in Site Map): {len(extra_ids)}")
    if extra_ids[:10]:
        print("  extras sample:", ", ".join(extra_ids[:10]))
    print("status:", dict(status_counts))
    print("parity:", dict(parity_counts))

    write_scorecard(len(site_ids), len(ordered), len(missing_ids) if dry else 0 if not missing_ids else len(missing_ids), len(extra_ids), status_counts, parity_counts)

    if dry:
        print(f"Dry-run: would add {len(new_stubs)} rows. Sample:")
        for r in new_stubs[:15]:
            print(f"  {r['prgId']} | {r['menu_path_l1']} | {r['screen_name']} | {r['bluearm_parity']}")
        write_deferred_register(ordered)  # preview from projected
        # Fix scorecard G0 for dry: still failing
        write_scorecard(len(site_ids), len(matrix), len(missing_ids), len(extra_ids), Counter(r.get("status") or "" for r in matrix), Counter())
        return

    with MATRIX.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDNAMES, extrasaction="ignore")
        w.writeheader()
        w.writerows(ordered)

    write_deferred_register(ordered)
    # After write G0 = 0 missing vs site
    left = site_ids - {r["prgId"] for r in ordered}
    write_scorecard(len(site_ids), len(ordered), len(left), len(extra_ids), status_counts, parity_counts)
    print(f"Wrote {MATRIX} ({len(ordered)} rows), {SCORECARD}, {DEFERRED}")
    print(f"G0 after write: missing={len(left)}")


if __name__ == "__main__":
    main()
