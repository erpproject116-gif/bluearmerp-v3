/** Forced light Chart.js tokens. Do not use dark Chart.js samples. */
export const BI_CHART_BACKGROUND = "#ffffff";
export const BI_CHART_TEXT = "#334155";
export const BI_CHART_GRID = "#e2e8f0";
export const BI_CHART_TOOLTIP_BG = "#ffffff";
export const BI_CHART_TOOLTIP_TEXT = "#0f172a";

/** Brand-aligned light palette (blue, emerald, amber, rose, sky, violet, teal, gold). */
export const BI_PALETTE = [
  "#2563eb",
  "#059669",
  "#d97706",
  "#e11d48",
  "#0284c7",
  "#7c3aed",
  "#0d9488",
  "#ca8a04",
];

export function biPalette(count: number): string[] {
  if (count <= 0) return [];
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(BI_PALETTE[i % BI_PALETTE.length]!);
  }
  return out;
}
