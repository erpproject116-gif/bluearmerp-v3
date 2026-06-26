export type ReportTemplateKey =
  | "sales_discount_status"
  | "sales_status"
  | "sales_order_status"
  | "official_receipt_status";

export type ReportColumnDef = {
  key: string;
  label: string;
  align?: "left" | "right";
};

export type SavedReportTemplate<TSettings = Record<string, unknown>> = {
  id: number;
  report_key: string;
  template_code: string;
  template_name: string;
  settings: TSettings;
  updated_at: string;
};

export type ReportLogoAsset = {
  id: number;
  report_key: string;
  file_name: string;
  mime_type?: string;
  size_bytes: number;
};

export const REPORT_TEMPLATE_API = "/api/v1/report-templates";

export function reportTemplatesUrl(reportKey: ReportTemplateKey, suffix = ""): string {
  const qs = `report_key=${encodeURIComponent(reportKey)}`;
  if (!suffix) return `${REPORT_TEMPLATE_API}?${qs}`;
  if (suffix.startsWith("?")) return `${REPORT_TEMPLATE_API}${suffix}&${qs}`;
  return `${REPORT_TEMPLATE_API}/${suffix}?${qs}`;
}

export function reportLogoDownloadUrl(assetId: number, inline = true): string {
  const qs = inline ? "?inline=1" : "";
  return `${REPORT_TEMPLATE_API}/logo/${assetId}/download${qs}`;
}
