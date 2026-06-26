import type { SalesDiscountStatusTemplate } from "./salesDiscountStatusTemplate";

export type DiscountReportPresetId = "default" | "with_apvl" | "graph" | "apvl_graph";

export type DiscountReportPreset = {
  id: DiscountReportPresetId;
  label: string;
  displayApvlLine: boolean;
  viewAsGraph: boolean;
};

export const DISCOUNT_REPORT_PRESETS: DiscountReportPreset[] = [
  { id: "default", label: "Default", displayApvlLine: false, viewAsGraph: false },
  { id: "with_apvl", label: "With Apvl. Line", displayApvlLine: true, viewAsGraph: false },
  { id: "graph", label: "Graph View", displayApvlLine: false, viewAsGraph: true },
  { id: "apvl_graph", label: "Apvl. Line + Graph", displayApvlLine: true, viewAsGraph: true },
];

export function presetById(id: DiscountReportPresetId): DiscountReportPreset {
  return DISCOUNT_REPORT_PRESETS.find((p) => p.id === id) ?? DISCOUNT_REPORT_PRESETS[0];
}

export function applyReportPreset(
  template: SalesDiscountStatusTemplate,
  presetId: DiscountReportPresetId,
): SalesDiscountStatusTemplate {
  const preset = presetById(presetId);
  return {
    ...template,
    appliedPresetId: presetId,
    customTemplateId: null,
    customTemplateCode: null,
    displayApvlLine: preset.displayApvlLine,
    viewAsGraph: preset.viewAsGraph,
  };
}

export function detectPresetId(template: Pick<SalesDiscountStatusTemplate, "displayApvlLine" | "viewAsGraph">): DiscountReportPresetId {
  if (template.displayApvlLine && template.viewAsGraph) return "apvl_graph";
  if (template.displayApvlLine) return "with_apvl";
  if (template.viewAsGraph) return "graph";
  return "default";
}

export function presetLabel(id: DiscountReportPresetId): string {
  return presetById(id).label;
}
