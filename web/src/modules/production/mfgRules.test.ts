import { describe, expect, it } from "vitest";
import {
  canCompleteWorkOrder,
  canEditWorkOrder,
  canPostWithShortage,
  canRevertToDraft,
  componentStockStatus,
  excessWasteQty,
  floorStatusLabel,
  materialNeedsHasShortage,
  normalizeOutputClassification,
  receivesStockForClassification,
  requiredComponentQty,
  validateWasteLine,
  wasteRequiresReason,
} from "./mfgRules";

describe("mfgRules", () => {
  it("classifies stock chips", () => {
    expect(componentStockStatus(10, 8, 2)).toBe("insufficient");
    expect(componentStockStatus(10, 11, 0)).toBe("low_stock");
    expect(componentStockStatus(10, 20, 0)).toBe("in_stock");
  });

  it("gates edit / revert / complete / shortage", () => {
    expect(canEditWorkOrder("draft")).toBe(true);
    expect(canEditWorkOrder("released")).toBe(false);
    expect(canRevertToDraft("released", false, false)).toBe(true);
    expect(canRevertToDraft("released", false, true)).toBe(false);
    expect(canCompleteWorkOrder("released", "released").ok).toBe(true);
    expect(canCompleteWorkOrder("released", "pending").ok).toBe(false);
    expect(canPostWithShortage(true, false)).toBe(false);
    expect(canPostWithShortage(false, false)).toBe(true);
  });

  it("computes required qty and shortage flags", () => {
    expect(requiredComponentQty(2, 5)).toBe(10);
    expect(materialNeedsHasShortage([{ shortage: 0 }, { shortage: 1 }])).toBe(true);
    expect(floorStatusLabel("released")).toBe("In progress");
  });

  it("classifies cutting outputs", () => {
    expect(normalizeOutputClassification("by-product")).toBe("byproduct");
    expect(receivesStockForClassification("waste")).toBe(false);
    expect(receivesStockForClassification("finished")).toBe(true);
    expect(excessWasteQty(3, 5)).toBe(2);
    expect(wasteRequiresReason(5, 3, false)).toBe(true);
    expect(wasteRequiresReason(3, 3, false)).toBe(false);
    expect(validateWasteLine(5, 3, null)).toBe("Abnormal or excess waste requires a waste reason.");
    expect(validateWasteLine(5, 3, 1)).toBeNull();
    expect(validateWasteLine(3, 3, null)).toBeNull();
  });
});
