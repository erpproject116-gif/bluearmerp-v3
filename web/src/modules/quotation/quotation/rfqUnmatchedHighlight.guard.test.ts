/**
 * Guard: the RFQ import review grid must keep highlighting lines that are not
 * bound to an inventory item (amber row + "Not in inventory" / weak-match chip).
 * Source-scan style mirrors moneyCallSites.guard.test.ts — if the markers move,
 * update this test together with the UI.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MODAL = path.resolve(__dirname, "RfqImportModal.tsx");

describe("RFQ unmatched-line highlight", () => {
  const src = fs.readFileSync(MODAL, "utf8");

  it("keeps the amber row binding for lines without an item_id", () => {
    expect(src).toMatch(/classList=\{\{\s*"bg-amber-50\/60":\s*!row\.item_id\s*\}\}/);
  });

  it("keeps the unmatched and weak-match chips", () => {
    expect(src).toContain("unmatchedChipClass");
    expect(src).toContain("Not in inventory");
    expect(src).toContain("Weak match — review");
  });

  it("keeps the unmatched-count warning banner", () => {
    expect(src).toContain("Some lines are not in inventory");
    expect(src).toMatch(/unmatchedCount\(\)\s*>\s*0/);
  });
});
