import { beforeEach, describe, expect, it } from "vitest";
import {
  docSeedKey,
  docSeedLinePatch,
  hasDocSeed,
  takeDocSeed,
  takeSerialLotSeed,
  SERIAL_LOT_SEED_KEY,
} from "./docSeed";
import { takeMigImportSeed, MIG_IMPORT_SEED_KEY } from "./migrationCsvImport";

describe("docSeed", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("takeDocSeed consumes the seed exactly once", () => {
    sessionStorage.setItem(
      docSeedKey("sales_order"),
      JSON.stringify({ partner_id: 7, partner_name: "Acme", lines: [{ item_name: "Pen", qty: 1 }] }),
    );
    expect(hasDocSeed("sales_order")).toBe(true);
    const seed = takeDocSeed("sales_order");
    expect(seed?.partner_id).toBe(7);
    expect(seed?.lines?.[0]?.item_name).toBe("Pen");
    expect(hasDocSeed("sales_order")).toBe(false);
    expect(takeDocSeed("sales_order")).toBeNull();
  });

  it("takeDocSeed rejects malformed payloads", () => {
    sessionStorage.setItem(docSeedKey("sales"), "not-json{");
    expect(takeDocSeed("sales")).toBeNull();
    sessionStorage.setItem(docSeedKey("sales"), JSON.stringify({ lines: "nope" }));
    expect(takeDocSeed("sales")).toBeNull();
  });

  it("docSeedLinePatch maps seed fields to row fields", () => {
    const patch = docSeedLinePatch({
      item_id: 3,
      item_code: " PEN-01 ",
      item_name: "Pen",
      qty: 5,
      unit: "box",
      unit_id: null,
      unit_code: "",
      unit_price: 12.5,
      remarks: "urgent",
    });
    expect(patch.item_id).toBe(3);
    expect(patch.item_code).toBe("PEN-01");
    expect(patch.qty).toBe("5");
    expect(patch.unit_price).toBe("12.5");
    // Unresolved unit lands in the remark, not silently dropped.
    expect(patch.remark).toContain("urgent");
    expect(patch.remark).toContain("UOM: box");
  });

  it("docSeedLinePatch defaults qty to 1 and blank price for 0", () => {
    const patch = docSeedLinePatch({ item_name: "Pen", unit_price: 0 });
    expect(patch.qty).toBe("1");
    expect(patch.unit_price).toBe("");
  });

  it("takeSerialLotSeed consumes once and validates rows", () => {
    sessionStorage.setItem(
      SERIAL_LOT_SEED_KEY,
      JSON.stringify({ file_name: "s.csv", rows: [{ serial: "SN-1" }, { lot: "L-1" }] }),
    );
    const seed = takeSerialLotSeed();
    expect(seed?.rows?.length).toBe(2);
    expect(takeSerialLotSeed()).toBeNull();

    sessionStorage.setItem(SERIAL_LOT_SEED_KEY, JSON.stringify({ rows: "nope" }));
    expect(takeSerialLotSeed()).toBeNull();
  });

  it("takeMigImportSeed validates kind and consumes once", () => {
    sessionStorage.setItem(
      MIG_IMPORT_SEED_KEY,
      JSON.stringify({ kind: "items", file_name: "i.csv", csv_text: "item_name\nPen" }),
    );
    const seed = takeMigImportSeed();
    expect(seed?.kind).toBe("items");
    expect(takeMigImportSeed()).toBeNull();

    sessionStorage.setItem(MIG_IMPORT_SEED_KEY, JSON.stringify({ kind: "bogus" }));
    expect(takeMigImportSeed()).toBeNull();
  });
});
