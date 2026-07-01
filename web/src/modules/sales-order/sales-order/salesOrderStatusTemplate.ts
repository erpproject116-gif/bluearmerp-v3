export {
  defaultStatusReportTemplate as defaultSalesOrderStatusTemplate,
  loadStatusReportTemplate as loadSalesOrderStatusTemplate,
  saveStatusReportTemplate as saveSalesOrderStatusTemplate,
  SALES_ORDER_STATUS_REPORT_KEY,
  type StatusReportTemplateSettings as SalesOrderStatusTemplate,
} from "../../../shared/reportTemplates/statusReportTemplate";

import { useReportTemplates } from "../../../shared/reportTemplates/useReportTemplates";
import { SALES_ORDER_STATUS_REPORT_KEY, type StatusReportTemplateSettings } from "../../../shared/reportTemplates/statusReportTemplate";

export function useSalesOrderStatusReportTemplates() {
  return useReportTemplates<StatusReportTemplateSettings>(SALES_ORDER_STATUS_REPORT_KEY);
}
