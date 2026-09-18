import { describe, expect, it } from "vitest";
import {
  shouldShowPurchaseSerialScanBar,
  trackingPolicyIsRequired,
  validatePurchaseTrackingLine,
} from "./purchaseReceiveTracking";

describe("purchase receive tracking policy 2B", () => {
  it("uses required as the safe default", () => {
    expect(trackingPolicyIsRequired()).toBe(true);
    expect(trackingPolicyIsRequired("unknown")).toBe(true);
    expect(trackingPolicyIsRequired(" OPTIONAL ")).toBe(false);
  });

  it("allows empty optional serials but rejects partial capture", () => {
    const base = { line_no: 1, qty: 2, track_serial: true, serial_policy: "optional" };
    expect(validatePurchaseTrackingLine(base)).toBeNull();
    expect(validatePurchaseTrackingLine({ ...base, serial_nos: ["S1"] })).toContain("serial count");
    expect(validatePurchaseTrackingLine({ ...base, serial_nos: ["S1", "S2"] })).toBeNull();
  });

  it("requires serials when the policy is required", () => {
    expect(
      validatePurchaseTrackingLine({
        line_no: 2,
        qty: 2,
        track_serial: true,
        serial_policy: "required",
      }),
    ).toContain("serial count");
  });

  it("allows empty optional lots but requires entered lots to balance", () => {
    const base = { line_no: 3, qty: 5, track_lot: true, lot_policy: "optional" };
    expect(validatePurchaseTrackingLine(base)).toBeNull();
    expect(
      validatePurchaseTrackingLine({ ...base, lot_lines: [{ lot_no: "LOT-A", qty: 4 }] }),
    ).toContain("lot qty");
    expect(
      validatePurchaseTrackingLine({
        ...base,
        lot_lines: [
          { lot_no: "LOT-A", qty: 2 },
          { lot_no: "LOT-B", qty: 3 },
        ],
      }),
    ).toBeNull();
  });

  it("validates serial and lot lines independently on a mixed document", () => {
    const lines = [
      { line_no: 1, qty: 1, track_serial: true, serial_policy: "required", serial_nos: ["S1"] },
      { line_no: 2, qty: 2, track_lot: true, lot_policy: "required", lot_lines: [{ lot_no: "L1", qty: 2 }] },
      { line_no: 3, qty: 4 },
    ];
    expect(lines.map(validatePurchaseTrackingLine)).toEqual([null, null, null]);
    expect(shouldShowPurchaseSerialScanBar(lines)).toBe(true);
    expect(shouldShowPurchaseSerialScanBar(lines.slice(1))).toBe(false);
  });

  it("skips capture validation for already-received GR lines", () => {
    expect(
      validatePurchaseTrackingLine({
        line_no: 4,
        qty: 2,
        goods_receipt_line_id: 99,
        track_lot: true,
        lot_policy: "required",
      }),
    ).toBeNull();
  });
});
