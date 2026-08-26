import { describe, expect, it } from "vitest";
import {
  coalesceSpecDescription,
  itemSpecAsLineDescription,
  syncSpecDescriptionPatch,
} from "./itemLineSpecDescription";

describe("itemLineSpecDescription", () => {
  it("maps item spec_name to line description", () => {
    expect(itemSpecAsLineDescription({ spec_name: " 8GB DDR4 " })).toBe("8GB DDR4");
    expect(itemSpecAsLineDescription({})).toBe("");
  });

  it("coalesces either column", () => {
    expect(coalesceSpecDescription("", "spec")).toBe("spec");
    expect(coalesceSpecDescription("desc", "spec")).toBe("desc");
  });

  it("keeps dual columns in sync when one is edited", () => {
    expect(syncSpecDescriptionPatch({ spec_name: "A" })).toEqual({
      spec_name: "A",
      description: "A",
    });
    expect(syncSpecDescriptionPatch({ description: "B" })).toEqual({
      description: "B",
      spec_name: "B",
    });
  });
});
