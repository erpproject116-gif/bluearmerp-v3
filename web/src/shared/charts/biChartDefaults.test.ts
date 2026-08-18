import { describe, expect, it } from "vitest";
import { BI_CHART_BACKGROUND, BI_PALETTE, biPalette } from "./biChartDefaults";
import { whiteBackgroundPlugin } from "./registerBiCharts";

describe("bi chart light defaults", () => {
  it("uses a white canvas background", () => {
    expect(BI_CHART_BACKGROUND).toBe("#ffffff");
    expect(whiteBackgroundPlugin.id).toBe("biWhiteBackground");
  });

  it("does not include dark-theme sample colors", () => {
    expect(BI_PALETTE.some((c) => c.toLowerCase() === "#0b1220")).toBe(false);
    expect(BI_PALETTE.every((c) => c.startsWith("#"))).toBe(true);
  });

  it("repeats the palette for extra slices", () => {
    expect(biPalette(0)).toEqual([]);
    expect(biPalette(2)).toEqual([BI_PALETTE[0], BI_PALETTE[1]]);
    expect(biPalette(BI_PALETTE.length + 1)[BI_PALETTE.length]).toBe(BI_PALETTE[0]);
  });
});
