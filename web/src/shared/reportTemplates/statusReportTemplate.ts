import type { ReportTemplateKey } from "./types";

export type StatusReportTemplateSettings = {
  printHeader: string;
  printFooter: string;
  logoAssetId: number | null;
};

export function defaultStatusReportTemplate(): StatusReportTemplateSettings {
  return { printHeader: "", printFooter: "", logoAssetId: null };
}

export function loadStatusReportTemplate(storageKey: string): StatusReportTemplateSettings {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return defaultStatusReportTemplate();
    return { ...defaultStatusReportTemplate(), ...JSON.parse(raw) };
  } catch {
    return defaultStatusReportTemplate();
  }
}

export function saveStatusReportTemplate(storageKey: string, template: StatusReportTemplateSettings) {
  localStorage.setItem(storageKey, JSON.stringify(template));
}

export const SALES_STATUS_REPORT_KEY: ReportTemplateKey = "sales_status";
export const SALES_ORDER_STATUS_REPORT_KEY: ReportTemplateKey = "sales_order_status";
export const OFFICIAL_RECEIPT_STATUS_REPORT_KEY: ReportTemplateKey = "official_receipt_status";
