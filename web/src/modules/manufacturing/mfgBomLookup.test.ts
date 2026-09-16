import { describe, expect, it } from "vitest";
import {
  ctaForBomType,
  normalizeBomType,
  orderHrefForBomType,
  toBomOption,
} from "./mfgBomLookup";

describe("mfgBomLookup", () => {
  it("treats process aliases as recipe", () => {
    expect(normalizeBomType("recipe")).toBe("recipe");
    expect(normalizeBomType("process")).toBe("recipe");
    expect(normalizeBomType("processing")).toBe("recipe");
    expect(normalizeBomType("cutting")).toBe("disassembly");
    expect(normalizeBomType(undefined)).toBe("assembly");
  });

  it("points wrong-type recovery at the matching New Order screen", () => {
    expect(orderHrefForBomType("recipe")).toBe("/app/production/orders/new?type=recipe");
    expect(ctaForBomType("recipe")).toMatch(/Recipe Order/i);
    expect(orderHrefForBomType("assembly")).toBe("/app/production/orders/new");
    expect(orderHrefForBomType("disassembly")).toContain("cutting");
  });

  it("includes finished item code in lookup labels", () => {
    const opt = toBomOption({
      id: 1,
      bom_code: "R09132026-000001",
      bom_name: "Build",
      finished_item_code: "DSK-BARM-I5",
      finished_item_name: "Desktop",
    });
    expect(opt.label).toContain("R09132026-000001");
    expect(opt.label).toContain("DSK-BARM-I5");
  });
});
