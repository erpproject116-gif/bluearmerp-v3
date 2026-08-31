import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  MIG_ENTITY_FIELDS,
  MIG_NEEDS_ITEM,
  MIG_NEEDS_JOB_DEFAULTS,
  MIG_REQUIRED,
  MIG_TEMPLATE_FILENAME,
  parseCsvHeaders,
  spreadsheetToCsvFile,
  stripCsvBom,
  type MigKind,
} from "./migrationCsvImport";

/** Snapshot of Go importer canonical / required slices. Fail if TS drifts. */
const GO_CANONICAL: Record<MigKind, string[]> = {
  items: [
    "item_code",
    "item_name",
    "purchase_price",
    "sales_price",
    "vip_price",
    "status",
    "track_serial",
    "track_lot",
    "serial_policy",
    "lot_policy",
    "track_inventory_qty",
    "warranty_duration_months",
    "spec_name",
    "unit",
    "item_category",
    "item_type",
    "oe_price",
  ],
  partners: [
    "partner_code",
    "company_name",
    "partner_kind",
    "ceo_name",
    "phone",
    "mobile",
    "email",
    "address",
    "tin",
    "status",
  ],
  accounts: ["account_code", "account_name", "account_type", "is_group", "is_active", "sort_order"],
  opening_stock: ["item_code", "item", "quantity", "location", "as_of_date"],
  opening_lots: ["item_code", "lot_no", "qty", "catch_weight", "expiry_date", "location", "as_of_date"],
  boms: ["bom_code", "bom_name", "finished_item_code", "bom_type", "component_item_code", "qty", "scrap_qty", "yield_pct"],
  open_si: ["source_doc_no", "partner", "date", "item_code", "item", "quantity", "amount", "si_dr_no"],
  open_ap: ["source_doc_no", "partner", "date", "item_code", "item", "quantity", "amount", "vendor_invoice_no"],
  open_po: ["source_doc_no", "partner", "date", "item_code", "item", "quantity", "amount"],
  open_quo: ["source_doc_no", "partner", "date", "item_code", "item", "quantity", "amount"],
  open_so: ["source_doc_no", "partner", "date", "item_code", "item", "quantity", "amount"],
  open_pr: ["source_doc_no", "partner", "date", "item_code", "item", "quantity", "amount"],
  open_rfq: ["source_doc_no", "date", "item_code", "item", "quantity", "notes"],
  in_transit: ["item_code", "item", "quantity", "from_location", "to_location", "date"],
};

const GO_REQUIRED: Record<MigKind, string[]> = {
  items: ["item_name"],
  partners: ["company_name", "partner_kind"],
  accounts: ["account_code", "account_name", "account_type"],
  opening_stock: ["quantity", "location"],
  opening_lots: ["item_code", "lot_no", "location"],
  boms: ["bom_code", "finished_item_code", "component_item_code", "qty"],
  open_si: ["source_doc_no", "partner", "date", "amount"],
  open_ap: ["source_doc_no", "partner", "date", "amount"],
  open_po: ["source_doc_no", "partner", "date", "item", "quantity"],
  open_quo: ["source_doc_no", "partner", "date", "item", "quantity"],
  open_so: ["source_doc_no", "partner", "date", "item", "quantity"],
  open_pr: ["source_doc_no", "date", "item", "quantity"],
  open_rfq: ["source_doc_no", "date", "item", "quantity"],
  in_transit: ["quantity", "from_location", "to_location"],
};

describe("migrationCsvImport", () => {
  it("requires job defaults only for open documents", () => {
    expect(MIG_NEEDS_JOB_DEFAULTS.items).toBe(false);
    expect(MIG_NEEDS_JOB_DEFAULTS.open_si).toBe(true);
    expect(MIG_NEEDS_JOB_DEFAULTS.open_ap).toBe(true);
    expect(MIG_NEEDS_JOB_DEFAULTS.open_quo).toBe(true);
    expect(MIG_NEEDS_JOB_DEFAULTS.open_so).toBe(true);
    expect(MIG_NEEDS_JOB_DEFAULTS.open_pr).toBe(true);
    expect(MIG_NEEDS_JOB_DEFAULTS.open_rfq).toBe(false);
    expect(MIG_REQUIRED.opening_stock).toContain("quantity");
  });

  it("matches Go canonical and required field lists", () => {
    (Object.keys(GO_CANONICAL) as MigKind[]).forEach((kind) => {
      expect(MIG_ENTITY_FIELDS[kind], kind).toEqual(GO_CANONICAL[kind]);
      expect(MIG_REQUIRED[kind], kind).toEqual(GO_REQUIRED[kind]);
    });
  });

  it("requires an item mapping for stock and open documents", () => {
    expect(MIG_NEEDS_ITEM.opening_stock).toBe(true);
    expect(MIG_NEEDS_ITEM.open_si).toBe(true);
    expect(MIG_NEEDS_ITEM.in_transit).toBe(true);
    expect(MIG_NEEDS_ITEM.items).toBe(false);
  });

  it("uses the same template filenames as the API", () => {
    expect(MIG_TEMPLATE_FILENAME.items).toBe("mig-items-import-template.csv");
    expect(MIG_TEMPLATE_FILENAME.in_transit).toBe("mig-in-transit-import-template.csv");
  });

  it("strips a UTF-8 BOM from CSV headers", () => {
    expect(stripCsvBom("\uFEFFitem_code")).toBe("item_code");
    expect(parseCsvHeaders("\uFEFFitem_code,item_name\nEXAMPLE-ITEM,Widget")).toEqual(["item_code", "item_name"]);
  });

  it("converts first Excel sheet to CSV", async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["Item Name", "Qty"],
      ["Pen", 2],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const xlsx = new File([buf], "items.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const csv = await spreadsheetToCsvFile(xlsx);
    expect(csv.name).toMatch(/\.csv$/);
    const text = await csv.text();
    expect(text).toContain("Item Name");
    expect(text).toContain("Pen");
  });

  it("serializes Excel date cells as yyyy-mm-dd", async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(
      [
        ["date", "quantity"],
        [new Date(2026, 0, 31), 10.5],
      ],
      { cellDates: true },
    );
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx", cellDates: true }) as ArrayBuffer;
    const xlsx = new File([buf], "stock.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const csv = await spreadsheetToCsvFile(xlsx);
    const text = await csv.text();
    expect(text).toMatch(/2026-01-31/);
  });
});
