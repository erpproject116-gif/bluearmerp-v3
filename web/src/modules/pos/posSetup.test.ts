import { describe, expect, it } from "vitest";
import {
  posSetupOutlineActive,
  posSetupRequiredOpen,
  posSetupRows,
  posSetupScrollTarget,
  posTileBorderClass,
} from "./posSetup";

const empty = {
  default_location_id: null,
  default_tax_type_id: null,
  enable_barcode: false,
  require_customer: false,
};

describe("posTileBorderClass", () => {
  it("names the sold-out and low borders", () => {
    expect(posTileBorderClass("sold_out")).toContain("pos-stock-breathe-sold");
    expect(posTileBorderClass("low")).toContain("pos-stock-breathe-low");
  });
});

describe("posSetupRows", () => {
  it("marks barcode Set only when the checkbox is on or the shell flag is true", () => {
    expect(posSetupRows(empty, { shellScans: false, taxLabel: "" }).find((r) => r.id === "enable_barcode")?.set).toBe(
      false,
    );
    expect(
      posSetupRows({ ...empty, enable_barcode: true }, { shellScans: false, taxLabel: "" }).find(
        (r) => r.id === "enable_barcode",
      )?.set,
    ).toBe(true);
    expect(posSetupRows(empty, { shellScans: true, taxLabel: "" }).find((r) => r.id === "enable_barcode")?.set).toBe(
      true,
    );
  });

  it("keeps the home panel only while a required row is open", () => {
    const open = posSetupRows(empty, { shellScans: false, taxLabel: "" });
    expect(posSetupRequiredOpen(open)).toBe(true);
    const done = posSetupRows(
      { ...empty, default_location_id: 4, default_tax_type_id: 2, enable_barcode: true, require_customer: true },
      { shellScans: false, taxLabel: "VAT (12%)" },
    );
    expect(posSetupRequiredOpen(done)).toBe(false);
    expect(done.find((r) => r.id === "require_customer")?.set).toBe(false);
    expect(done.find((r) => r.id === "default_tax_type")?.value).toBe("VAT (12%)");
  });
});

describe("posSetupScrollTarget", () => {
  it("does not scroll for an unknown focus value", () => {
    expect(posSetupScrollTarget("not-a-field")).toBeNull();
    expect(posSetupOutlineActive("not-a-field", "1", "1")).toBe(false);
  });

  it("scrolls only for an allowed focus", () => {
    expect(posSetupScrollTarget("default_location")).toBe("pos-setup-default_location");
  });
});
