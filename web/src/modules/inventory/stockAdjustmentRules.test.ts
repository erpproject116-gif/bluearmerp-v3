import { describe, expect, it } from "vitest";
import {
  stockAdjustmentToastErrors,
  stockAdjustmentTrackingKind,
  trackedAdjustmentMessage,
} from "./stockAdjustmentRules";

describe("stock adjustment tracked-item rules", () => {
  it("classifies standard, serial, lot, and dual tracking", () => {
    expect(stockAdjustmentTrackingKind({ track_serial: false, track_lot: false })).toBe("standard");
    expect(stockAdjustmentTrackingKind({ track_serial: true, track_lot: false })).toBe("serial");
    expect(stockAdjustmentTrackingKind({ track_serial: false, track_lot: true })).toBe("lot");
    expect(stockAdjustmentTrackingKind({ track_serial: true, track_lot: true })).toBe("both");
  });

  it("returns workflow-specific guidance", () => {
    expect(trackedAdjustmentMessage("serial")).toMatch(/Open Serials.*Fix this unit/i);
    expect(trackedAdjustmentMessage("lot")).toMatch(/Open Lots.*Change quantity/i);
    expect(trackedAdjustmentMessage("both")).toMatch(/serial units and lot batches/i);
    expect(trackedAdjustmentMessage("standard")).toBe("");
  });

  it("keeps reason inline and out of sticky blocker toasts", () => {
    expect(
      stockAdjustmentToastErrors({
        reason: "Reason is required.",
        lines: "Line 1 needs an item.",
      }),
    ).toEqual({ lines: "Line 1 needs an item." });
    expect(stockAdjustmentToastErrors({ reason: "Reason is required." })).toEqual({});
  });
});
