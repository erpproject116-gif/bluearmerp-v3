export {
  defaultStatusReportTemplate as defaultOfficialReceiptStatusTemplate,
  loadStatusReportTemplate as loadOfficialReceiptStatusTemplate,
  saveStatusReportTemplate as saveOfficialReceiptStatusTemplate,
  OFFICIAL_RECEIPT_STATUS_REPORT_KEY,
  type StatusReportTemplateSettings as OfficialReceiptStatusTemplate,
} from "../../../shared/reportTemplates/statusReportTemplate";

import { useReportTemplates } from "../../../shared/reportTemplates/useReportTemplates";
import { OFFICIAL_RECEIPT_STATUS_REPORT_KEY, type StatusReportTemplateSettings } from "../../../shared/reportTemplates/statusReportTemplate";

export function useOfficialReceiptStatusReportTemplates() {
  return useReportTemplates<StatusReportTemplateSettings>(OFFICIAL_RECEIPT_STATUS_REPORT_KEY);
}
