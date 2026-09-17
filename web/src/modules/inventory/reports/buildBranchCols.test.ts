import { describe, expect, it } from "vitest";
import { buildBranchCols } from "./buildBranchCols";
import type { InventoryStatusRow } from "../../../shared/reports/useModuleReports";

function row(partial: Partial<InventoryStatusRow> & Pick<InventoryStatusRow, "location_id" | "branch_name">): InventoryStatusRow {
  return {
    item_id: 1,
    item_code: "A",
    item_name: "Item",
    item_status: "active",
    category_name: "",
    location_name: partial.branch_name,
    qty_on_hand: 0,
    qty_reserved: 0,
    available_qty: 0,
    sales_price: 0,
    company_available_qty: 0,
    stock_status: "in_stock",
    last_sold_by: "",
    last_sold_ref_type: "",
    last_movement_type: "",
    ...partial,
  };
}

describe("buildBranchCols", () => {
  it("keeps HQ from auth/branches even when inventory locations are empty", () => {
    const cols = buildBranchCols([{ id: 7, location_name: "HQ" }], [], []);
    expect(cols.map((c) => c.name)).toEqual(["HQ"]);
    expect(cols[0].locationIds).toEqual([7]);
  });

  it("pins HQ before other branch names", () => {
    const cols = buildBranchCols(
      [
        { id: 2, location_name: "Warehouse B" },
        { id: 1, location_name: "HQ" },
      ],
      [],
      [],
    );
    expect(cols.map((c) => c.name)).toEqual(["HQ", "Warehouse B"]);
  });

  it("merges duplicate names and accepts string location ids from rows", () => {
    const cols = buildBranchCols(
      [{ id: 1, location_name: "HQ" }],
      [{ id: 1, location_name: "HQ", is_rma: false, status: "active" }],
      [row({ location_id: "1" as unknown as number, branch_name: "HQ" })],
    );
    expect(cols).toHaveLength(1);
    expect(cols[0].locationIds).toEqual([1]);
  });

  it("skips RMA and inactive inventory locations but keeps row-backed branches", () => {
    const cols = buildBranchCols(
      [],
      [
        { id: 9, location_name: "RMA Bin", is_rma: true, status: "active" },
        { id: 8, location_name: "Old", is_rma: false, status: "inactive" },
      ],
      [row({ location_id: 3, branch_name: "Store" })],
    );
    expect(cols.map((c) => c.name)).toEqual(["Store"]);
  });
});
