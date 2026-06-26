#!/usr/bin/env python3
"""Build Item List / Sales Order List fixture xlsx from screenshot sample data."""

from __future__ import annotations

from pathlib import Path

import openpyxl

FIXTURES = Path(__file__).parent

ITEM_ROWS = [
    ("00002", "EPSON L3210 ALL IN ONE PRINTER", 8300, 8950, 8954, "YES"),
    ("00003", "Windows 10 Pro with CD PACKAGE (GRY)", 1900, 3500, 2500, "YES"),
    ("00004", "Equinox iG v4 Ryzen 5 5600g", None, 28950, None, "YES"),
    ("00005", "Equinox iG v4 Ryzen 7 5700g", None, 32500, None, "YES"),
    ("00006", "Bundle: Computer Package Basic V1", 20000, 25950, 23000, "YES"),
    ("00007", "PATRIOT RGB DDR4 32GB 3600MHZ CL20 (2X16GB) UDIMM BLACK HS KIT", 3750, 4500, 4400, "YES"),
    ("00008", "ACER ASPIRE 3 A315-510P-33C0 O3-N305/8GB/512GB/MSOFCE21/W11/15.6", 23800, 26500, 24950, "YES"),
    ("00009", "Generic RJ45 LAN Cable 5M", 45, 80, 70, "YES"),
    ("00010", "Generic Power Chord", 30, 50, 40, "YES"),
    ("00011", "LOGITECH MK270 WIRELESS KEYBOARD AND MOUSE COMBO", 850, 1150, 1095, "YES"),
    ("00012", "CANON PIXMA G3010 REFILLABLE INK TANK PRINTER", 6200, 7200, 6950, "YES"),
    ("00013", "TP-LINK ARCHER C6 AC1200 DUAL BAND ROUTER", 1150, 1450, 1395, "YES"),
    ("00014", "KINGSTON 16GB DDR4 3200MHZ SODIMM", 1250, 1550, 1495, "YES"),
    ("00015", "ADATA 512GB SU650 SATA SSD", 1650, 1950, 1895, "YES"),
    ("001000", "SAMSUNG 1TB M.2 PCIE SSD 980 PRO (MZ-V8P1T0BW)", 5303, 6100, 5728, "YES"),
    ("001001", "ACER TRAVELMATE P214-54-56WR i5-1235U/16GB/512GB PCIE NVME SSD/14/W11H (BLK)", 29250, 32500, 31500, "YES"),
    ("001002", "HP 932XL Officejet Ink Cartridge - BLACK", 850, 1150, 1095, "YES"),
    ("001003", "A4TECH OP-330 OPTICAL WHEEL MOUSE USB/BLACK", 120, 180, 165, "YES"),
    ("001004", "MANHATTAN USB OPTICAL WIRED MOUSE (BLACK)", 95, 150, 140, "YES"),
    ("001005", "GEILTIMA 8GB 3200 DDR4 WITH HEATSINK LONGDIM", 650, 850, 795, "YES"),
    ("001006", "GAMDIAS ATLAS HD27H III VA 200Hz FHD MONITOR", 5200, 6100, 5850, "YES"),
    ("001007", "LENOVO IDEAPAD SLIM 3 15IAH8-83ER000APH i5-12450H/8GB/512GB NVME/15/W11H/OFC21/HS (GRY)", 34500, 38300, 37250, "YES"),
    ("001008", "SEAGATE SKYHAWK 2TB HDD", 3100, 3700, 3550, "YES"),
    ("001009", "INHOUSE: Diagnose and Repair Laptop/Computer Plus parts/materials used", 0, 1500, 1200, "YES"),
    ("101BKB", "WESTERN DIGITAL 480GB GREEN SN350 NVME M.2", 2350, 2710, 2538, "YES"),
    ("101EXX", "EPOS IMPACT 860T ANC USB WIRED HEADSET", 2850, 3350, 3200, "YES"),
    ("101WOP", "SILVERSTONE FARA H1 MICRO ATX BLACK", 1920, 2500, 2073, "YES"),
]

SO_ROWS = [
    (
        "06/26/2026 -4",
        "260626004",
        "Clinica Prime",
        "MANHATTAN USB OPTICAL WIRED MOUSE (BLACK) [Peripherals]",
        "06/26/2026",
        150,
        "In Progress",
        "Mjan Saceda",
        "DELIVERY DATE : JUNE 29 (MORNING or AFTERNOON)",
        "CASH",
    ),
    (
        "06/26/2026 -3",
        "260626003",
        "SPC ISLAND POWER CORPORATION",
        "GEILTIMA 8GB 3200 DDR4 WITH HEATSINK LONGDIM [RAM]",
        "06/27/2026",
        850,
        "In Progress",
        "Chrisa Barte",
        None,
        "BANK TRANSFER",
    ),
    (
        "06/26/2026 -2",
        "260626002",
        "MIGRATION UNITY",
        "LENOVO IDEAPAD SLIM 3 14IRH10-83K000ERPH I7-13620H/8GB+8GB/512GB NVME/14/W11H/OFFC21HS+365BASIC (GRY) [Laptop] and 2 more",
        "06/26/2026",
        55500,
        "In Progress",
        "Jenabie Tahanlangit",
        "PLEASE DELIVER THIS AFTERNOON 6-26-2026 FOR THE DELIVERY: LOOK FOR MAAM SHEILD NUMBER: +639190094830",
        "BANK TRANSFER",
    ),
    (
        "06/26/2026 -1",
        "260626001",
        "JUANEL CASAVERDE",
        "GAMDIAS ATLAS HD27H III VA 200Hz FHD MONITOR [Monitors]",
        "06/28/2026",
        6100,
        "In Progress",
        "Mariano Villordon Jr",
        None,
        "20 DAYS",
    ),
    (
        "06/25/2026 -2",
        "260625002",
        "GOLDEN GREAT PEAK ENGLISH SCHOOL INC.",
        "EPOS IMPACT 860T ANC USB WIRED HEADSET [Headset/Speaker]",
        "06/25/2026",
        3350,
        "In Progress",
        "Katherine Borinaga",
        None,
        "30 DAYS TERMS",
    ),
    (
        "06/25/2026 -1",
        "260625001",
        "ZAFIRE DISTRIBUTORS INC.",
        "ACER ASPIRE TC1785 I5-14400/8GB/1TB+256GB/W11H/OFC21HS+365BASIC DESKTOP (DT.BLNSP.003) [All In One PC]",
        "06/25/2026",
        71350,
        "In Progress",
        "Katherine Borinaga",
        "WAITING FOR THEIR CHEQUE(OVERDUE)",
        "30 DAYS",
    ),
    (
        "06/24/2026 -3",
        "260624003",
        "ZAFIRE DISTRIBUTORS INC.",
        "VENTION HDMI TO VGA CONVERTER ADAPTER W/ AUDIO (AIDB0) [Peripherals] and 1 more",
        "06/24/2026",
        1200,
        "In Progress",
        "Katherine Borinaga",
        None,
        "30 DAYS",
    ),
    (
        "06/24/2026 -2",
        "260624002",
        "RESPONSIVCODE TECHNOLOGY SOLUTIONS",
        "SEAGATE SKYHAWK 2TB HDD [Storage]",
        "06/24/2026",
        7400,
        "Completed",
        "Mariano Villordon Jr",
        "ako lang deliver ani thanks 6/24/26 SI 0034 DR 0048",
        "gcash",
    ),
    (
        "06/24/2026 -1",
        "260624001",
        "KONSTRAPHILS.INC.",
        "HP 932XL Officejet Ink Cartridge - BLACK [Peripherals]",
        "06/24/2026",
        1150,
        "In Progress",
        "Nel Tristan Juarez",
        None,
        "FREEBIES SA NO. 3042",
    ),
    (
        "06/23/2026 -2",
        "260623002",
        "INSUPHIL INDUSTRIAL CORP.",
        "A4TECH OP-330 OPTICAL WHEEL MOUSE USB/BLACK [Mouse]",
        "06/23/2026",
        180,
        "Completed",
        "Michelle Manlalic",
        None,
        "CASH",
    ),
    (
        "06/23/2026 -1",
        "260623001",
        "INSUPHIL INDUSTRIAL CORP.",
        "INHOUSE: Diagnose and Repair Laptop/Computer Plus parts/materials used [Services]",
        "06/23/2026",
        1500,
        "In Progress",
        "Michelle Manlalic",
        None,
        "BANK TRANSFER",
    ),
]


def write_item_list(path: Path) -> None:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Item List"
    ws.append(("Company Name : BLUEARM COMPUTER STORE / 05/27/2026 ~ 07/26/2026",))
    ws.append(("Item Code", "Item Name", "Purchase Price", "Sale Price", "VIP Price", "Active"))
    for row in ITEM_ROWS:
        ws.append(row)
    path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(path)
    wb.close()


def write_sales_order_list(path: Path) -> None:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Sales Order List"
    ws.append(("Company Name : BLUEARM COMPUTER STORE / 05/27/2026 ~ 07/26/2026",))
    ws.append(
        (
            "Date-No.",
            "Sales Order No.",
            "Customer Name",
            "Item Name (Summary)",
            "Delivery Date",
            "Total Sales Order Amount",
            "Progress Status",
            "Created Slip",
            "Print",
            "PIC Name",
            "Creator",
            "Delivery Remarks",
            "Payment Terms",
        )
    )
    for row in SO_ROWS:
        date_no, so_no, customer, item, delivery, amount, progress, pic, remarks, payment = row
        ws.append(
            (
                date_no,
                so_no,
                customer,
                item,
                delivery,
                amount,
                progress,
                "View",
                "Print",
                pic,
                pic,
                remarks,
                payment,
            )
        )
    path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(path)
    wb.close()


def main() -> None:
    item_path = FIXTURES / "item-list-export.xlsx"
    so_path = FIXTURES / "sales-order-list-export.xlsx"
    write_item_list(item_path)
    write_sales_order_list(so_path)
    print(f"Wrote {len(ITEM_ROWS)} items -> {item_path}")
    print(f"Wrote {len(SO_ROWS)} sales orders -> {so_path}")


if __name__ == "__main__":
    main()
