export {
  defaultStatusReportTemplate as defaultSalesStatusTemplate,
  loadStatusReportTemplate as loadSalesStatusTemplate,
  saveStatusReportTemplate as saveSalesStatusTemplate,
  SALES_STATUS_REPORT_KEY,
  type StatusReportTemplateSettings as SalesStatusTemplate,
} from "../../../shared/reportTemplates/statusReportTemplate";

import { useReportTemplates } from "../../../shared/reportTemplates/useReportTemplates";
import { SALES_STATUS_REPORT_KEY, type StatusReportTemplateSettings } from "../../../shared/reportTemplates/statusReportTemplate";

export function useSalesStatusReportTemplates() {
  return useReportTemplates<StatusReportTemplateSettings>(SALES_STATUS_REPORT_KEY);
}
