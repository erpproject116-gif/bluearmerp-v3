#!/usr/bin/env python3
"""
Phase C helper: promote known Done screens to bluearm_parity=parity (or partial)
using a curated map from gaps-bluearm.md evidence. Does not invent depth-complete.

Usage:
  python apply-known-parity.py
  python apply-known-parity.py --dry-run
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path

AUDIT = Path(__file__).resolve().parents[1]
MATRIX = AUDIT / "coverage-matrix.csv"

# prgId -> (parity, route, note). Only entries with strong Done evidence in gaps-bluearm.md
KNOWN: dict[str, tuple[str, str, str]] = {
    "C000029": ("partial", "/app/inventory/items", "Item list+modal tabs/F3 — gaps P1 Done; residual reports"),
    "C000030": ("partial", "/app/sales/sales", "Sales list pills + Load Slip + Cash In — gaps P1 Done"),
    "C000031": ("partial", "/app/purchases/purchases", "Purchase list + Load Slip + Cash Out — gaps P1 Done"),
    "E040205": ("partial", "/app/sales/sales/new", "New Sales form parity partial — gaps P1 Done core"),
    "E040303": ("partial", "/app/purchases/purchases/new", "New Purchases form — gaps P1 Done core"),
    "E040203": ("partial", "/app/sales-order/sales-orders/new", "New SO — crawled + wired"),
    "E040301": ("partial", "/app/purchase-order/purchase-orders/new", "New PO — crawled + wired"),
    "E010404": ("partial", "/app/finance/official-receipts", "Cash In - From Customer — OR list + modal"),
    "E010409": ("partial", "/app/finance/payment-vouchers", "Cash Out - To Vendor — PV list + modal"),
    "E010208": ("parity", "/app/finance/acct-i/bank-reconciliation", "Bank reconciliation Done in gaps"),
    "C000092": ("partial", "/app/inventory/serial-lot", "Serial/Lot hub — Inv.II pass Done features"),
    "C000690": ("parity", "/app/inventory/serial-lot", "Reg Serial/Lot F2 — gaps Done"),
    "C000691": ("parity", "/app/inventory/serial-lot", "Serial/Lot adj — gaps Done"),
    "E040634": ("parity", "/app/inventory/serial-lot", "Serial/Lot adj workspace — gaps Done"),
    "E040639": ("parity", "/app/inventory/serial-lot/reports/status", "Serial/Lot Status — gaps Done"),
    "E040620": ("parity", "/app/inventory/serial-lot/reports/book", "Serial Inv Book — gaps Done"),
    "E040619": ("parity", "/app/inventory/serial-lot/reports/balance", "Serial Inv Balance — gaps Done"),
    "E041018": ("parity", "/app/inventory/serial-lot/reports/reconciliation", "Item vs Serial balance — gaps Done"),
    "E040721": ("parity", "/app/selling/reports/receivable-status", "Receivable Status — gaps Done"),
    "E040722": ("parity", "/app/buying/reports/payable-status", "Payable Status — gaps Done"),
    "E010730": ("parity", "/app/finance/reports/acct-inventory-reconciliation", "Acct vs Inv recon — gaps Done"),
}


def main() -> None:
    dry = "--dry-run" in sys.argv
    rows = list(csv.DictReader(MATRIX.open(encoding="utf-8")))
    fieldnames = list(rows[0].keys()) if rows else []
    updated = 0
    for row in rows:
        pid = row.get("prgId") or ""
        if pid not in KNOWN:
            continue
        parity, route, note = KNOWN[pid]
        if row.get("bluearm_parity") == "deferred":
            continue
        changed = False
        if row.get("bluearm_parity") != parity:
            row["bluearm_parity"] = parity
            changed = True
        if route and (not row.get("bluearm_route") or row.get("bluearm_route") in ("—", "-")):
            row["bluearm_route"] = route
            changed = True
        elif route and row.get("bluearm_route") != route and row.get("bluearm_parity") in ("missing", "partial", ""):
            # Prefer curated route when upgrading
            row["bluearm_route"] = route
            changed = True
        if note and note not in (row.get("notes") or ""):
            row["notes"] = ((row.get("notes") or "") + f"; known-parity: {note}").strip("; ")
            changed = True
        if changed:
            updated += 1
            print(f"  {pid} -> {parity} {route}")
    print(f"Updated {updated} rows")
    if dry or not updated:
        return
    with MATRIX.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


if __name__ == "__main__":
    main()
