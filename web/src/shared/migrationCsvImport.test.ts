import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { MIG_NEEDS_JOB_DEFAULTS, MIG_REQUIRED, spreadsheetToCsvFile } from "./migrationCsvImport";

describe("migrationCsvImport", () => {
  it("requires job defaults only for open documents", () => {
    expect(MIG_NEEDS_JOB_DEFAULTS.items).toBe(false);
    expect(MIG_NEEDS_JOB_DEFAULTS.open_si).toBe(true);
    expect(MIG_NEEDS_JOB_DEFAULTS.open_ap).toBe(true);
    expect(MIG_REQUIRED.opening_stock).toContain("quantity");
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
});
