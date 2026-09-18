import { describe, expect, it } from "vitest";
import { buildManufacturingCostInput, totalManufacturingConversionCost } from "./manufacturingCostInput";

describe("manufacturing cost input", () => {
  it("builds labor, overhead, and other cost payloads", () => {
    const costs = buildManufacturingCostInput("120", "30.5", "9.5");
    expect(costs).toEqual({ labor_cost: 120, overhead_cost: 30.5, other_cost: 9.5 });
    expect(totalManufacturingConversionCost(costs)).toBe(160);
  });

  it("normalizes blank values to zero", () => {
    expect(buildManufacturingCostInput("", "", "")).toEqual({
      labor_cost: 0,
      overhead_cost: 0,
      other_cost: 0,
    });
  });
});
