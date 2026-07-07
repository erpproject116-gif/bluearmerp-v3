#!/usr/bin/env python3
"""Append catalog-only rows from site-map-prgids.csv into coverage-matrix.csv."""
from __future__ import annotations

import csv
import re
import sys
from pathlib import Path

AUDIT = Path(__file__).resolve().parents[1]
MATRIX = AUDIT / "coverage-matrix.csv"
SITEMAP = AUDIT / "site-map-prgids.csv"

# prgId prefixes for Inv. I transactional + Acct. I fast entry/reports + Acct. II AR/AP
PREFIXES = (
    "E0402",
    "E0403",
    "E0404",
    "E0405",
    "E0410",
    "E0102",
    "E0103",
    "E0104",
    "E0105",
    "E0108",
    "E0604",
    "E0605",
    "E0606",
)

HUB_LABELS = {
    "C000004": ("Inv. I", "Setup"),
    "C000030": ("Inv. I", "Sales"),
    "C000031": ("Inv. I", "Purchases"),
    "C000032": ("Inv. I", "Production"),
    "C000033": ("Inv. I", "Inv. Mov."),
    "C000654": ("Inv. I", "Online Store Mgmt"),
    "C000001": ("Acct. I", "Reports"),
    "C000010": ("Acct. I", "Fast Entry"),
    "C000125": ("Acct. II", "Receivable Management"),
    "C000126": ("Acct. II", "Payable Management"),
}


def infer_path(label: str, prg_id: str) -> tuple[str, str, str, str, str]:
    low = label.lower()
    if prg_id.startswith("E041"):
        return "Inv. I", "Online Store Mgmt", "Order Mgmt", label, "list"
    if prg_id.startswith("E0604") or prg_id.startswith("E0605"):
        l1 = "Acct. II"
        if "receivable" in low or prg_id.startswith("E0604"):
            l2 = "Receivable Management"
        else:
            l2 = "Payable Management"
        return l1, l2, label, label, "list" if "list" in low or "status" in low or "book" in low else "form"
    if prg_id.startswith("E0108") or "report" in low or "book" in low or "ledger" in low:
        return "Acct. I", "Reports", label, label, "report"
    if prg_id.startswith("E0102") or prg_id.startswith("E0103") or prg_id.startswith("E0104") or prg_id.startswith("E0105"):
        return "Acct. I", "Fast Entry", label, label, "form"
    if prg_id.startswith("E0403"):
        return "Inv. I", "Purchases", label, label, "form" if label.lower().startswith("new") else "list"
    if prg_id.startswith("E0404"):
        return "Inv. I", "Production", label, label, "form" if label.lower().startswith("new") else "list"
    if prg_id.startswith("E0405"):
        return "Inv. I", "Inv. Mov.", label, label, "form" if label.lower().startswith("new") else "list"
    return "Inv. I", "Sales", label, label, "form" if label.lower().startswith("new") else "list"


def screen_type_from_label(label: str, default: str) -> str:
    low = label.lower()
    if any(x in low for x in ("status", "aging", "balance", "report", "book", "ledger", "summary")):
        return "report" if "list" not in low else "list"
    if label.lower().startswith("new"):
        return "form"
    if "list" in low:
        return "list"
    return default


def main() -> None:
    dry_run = "--dry-run" in sys.argv
    matrix_rows = list(csv.DictReader(MATRIX.open(encoding="utf-8")))
    existing = {r["prgId"] for r in matrix_rows}
    site_rows = list(csv.DictReader(SITEMAP.open(encoding="utf-8")))

    new_rows: list[dict[str, str]] = []
    for row in site_rows:
        pid = row["prgId"]
        if pid in existing:
            continue
        if not any(pid.startswith(p) for p in PREFIXES):
            continue
        label = row["menu_label"].strip()
        if not label or label in HUB_LABELS:
            continue
        l1, l2, l3, screen, default_type = infer_path(label, pid)
        stype = screen_type_from_label(label, default_type)
        new_rows.append(
            {
                "prgId": pid,
                "menu_path_l1": l1,
                "menu_path_l2": l2,
                "menu_path_l3": l3,
                "screen_name": screen,
                "screen_type": stype,
                "tab_count": "0",
                "tabs_audited": "0",
                "status": "cataloged",
                "controls_logged": "0",
                "coverage_pct": "5",
                "bluearm_route": "—",
                "gap_priority": "P2" if l1 == "Acct. I" else "P1",
                "notes": f"Site Map catalog Jul 2026; menuSeq {row.get('menuSeq', '')}",
            }
        )

    if not new_rows:
        print("No new rows to add.")
        return

    print(f"Adding {len(new_rows)} catalog rows to {MATRIX}")
    if dry_run:
        for r in new_rows[:20]:
            print(r["prgId"], r["menu_path_l2"], r["screen_name"])
        print("...")
        return

    fieldnames = matrix_rows[0].keys() if matrix_rows else new_rows[0].keys()
    with MATRIX.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(matrix_rows)
        writer.writerows(new_rows)
    print(f"Done. Matrix now has {len(matrix_rows) + len(new_rows)} rows.")


if __name__ == "__main__":
    main()
