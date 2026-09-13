import { describe, expect, it } from "vitest";

/** Mirror of readBand for unit tests without DOM. */
function readBand(width: number): "xl" | "laptop" | "narrow" {
  if (width >= 1280) return "xl";
  if (width >= 1024) return "laptop";
  return "narrow";
}

describe("viewport band contract", () => {
  it("maps 1366 and 1280 to xl", () => {
    expect(readBand(1366)).toBe("xl");
    expect(readBand(1280)).toBe("xl");
  });

  it("maps 1279–1024 to laptop", () => {
    expect(readBand(1279)).toBe("laptop");
    expect(readBand(1024)).toBe("laptop");
  });

  it("maps below 1024 to narrow", () => {
    expect(readBand(1023)).toBe("narrow");
    expect(readBand(390)).toBe("narrow");
  });
});
