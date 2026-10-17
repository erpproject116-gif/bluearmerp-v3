import { describe, expect, it } from "vitest";
import { cuttingFinishCompleteFields, readCuttingFinishCarry, type CuttingFinishCarry } from "./cuttingFinishCarry";

const stored: CuttingFinishCarry = {
  work_order_id: 71,
  output_weighs: [{ component_item_id: 4, lot_no: "CUT-71-4", qty: 1.2 }],
  waste_lines: [{ classification: "waste", qty: 0.3, expected_qty: 0 }],
};

describe("readCuttingFinishCarry", () => {
  it("returns the payload when the work-order id matches", () => {
    expect(readCuttingFinishCarry(JSON.stringify(stored), 71)).toEqual(stored);
  });

  it("ignores a payload stored for another job", () => {
    expect(readCuttingFinishCarry(JSON.stringify(stored), 72)).toBeNull();
  });

  it("ignores invalid JSON", () => {
    expect(readCuttingFinishCarry("{", 71)).toBeNull();
  });
});

describe("cuttingFinishCompleteFields", () => {
  it("sends typed cut weights only when no parts are recorded", () => {
    expect(cuttingFinishCompleteFields(stored, 0)).toEqual({
      waste_lines: stored.waste_lines,
      output_weighs: stored.output_weighs,
    });
  });

  it("keeps recorded parts and still sends the leftover", () => {
    expect(cuttingFinishCompleteFields(stored, 1.5)).toEqual({
      waste_lines: stored.waste_lines,
    });
  });

  it("adds nothing when the payload is missing", () => {
    expect(cuttingFinishCompleteFields(null, 0)).toEqual({});
  });
});
