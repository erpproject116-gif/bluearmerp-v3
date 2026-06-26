import type { PrintPageSettings } from "../../../shared/printPageSettings";
import type { ReportTemplateKey } from "../../../shared/reportTemplates/types";
import {
  deleteReportTemplate,
  saveReportTemplate,
  useInvalidateReportTemplates,
  useReportTemplates,
} from "../../../shared/reportTemplates/useReportTemplates";
import type { SalesDiscountStatusTemplate } from "./salesDiscountStatusTemplate";

export const DISCOUNT_REPORT_KEY: ReportTemplateKey = "sales_discount_status";

export type SavedDiscountReportSettings = Pick<
  SalesDiscountStatusTemplate,
  | "displayApvlLine"
  | "viewAsGraph"
  | "sortField"
  | "sortOrder"
  | "sortField2"
  | "sortOrder2"
  | "subtotalBy"
  | "printHeader"
  | "printFooter"
  | "logoAssetId"
  | "columnVisibility"
> & {
  printPageSettings?: PrintPageSettings;
};

export function useDiscountReportTemplates() {
  return useReportTemplates<SavedDiscountReportSettings>(DISCOUNT_REPORT_KEY);
}

export function useInvalidateDiscountReportTemplates() {
  return useInvalidateReportTemplates(DISCOUNT_REPORT_KEY);
}

export async function saveDiscountReportTemplate(input: {
  template_code?: string;
  template_name: string;
  settings: SavedDiscountReportSettings;
}) {
  return saveReportTemplate(DISCOUNT_REPORT_KEY, input);
}

export async function deleteDiscountReportTemplate(templateCode: string) {
  return deleteReportTemplate(DISCOUNT_REPORT_KEY, templateCode);
}

export function settingsFromTemplate(
  template: SalesDiscountStatusTemplate,
  printPageSettings?: PrintPageSettings,
): SavedDiscountReportSettings {
  return {
    displayApvlLine: template.displayApvlLine,
    viewAsGraph: template.viewAsGraph,
    sortField: template.sortField,
    sortOrder: template.sortOrder,
    sortField2: template.sortField2,
    sortOrder2: template.sortOrder2,
    subtotalBy: template.subtotalBy,
    printHeader: template.printHeader,
    printFooter: template.printFooter,
    logoAssetId: template.logoAssetId,
    columnVisibility: template.columnVisibility,
    printPageSettings,
  };
}

export function applySavedSettings(
  base: SalesDiscountStatusTemplate,
  settings: SavedDiscountReportSettings,
  customTemplateId: number,
  customTemplateCode: string,
): SalesDiscountStatusTemplate {
  return {
    ...base,
    ...settings,
    appliedPresetId: "default",
    customTemplateId,
    customTemplateCode,
    printHeader: settings.printHeader ?? "",
    printFooter: settings.printFooter ?? "",
    logoAssetId: settings.logoAssetId ?? null,
    columnVisibility: settings.columnVisibility ?? base.columnVisibility,
  };
}
