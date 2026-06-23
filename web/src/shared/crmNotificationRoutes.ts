import type { CrmNotification } from "./useCrmNotifications";

/** Deep-link target for a CRM notification entity. */
export function crmNotificationHref(n: CrmNotification): string {
  const id = n.entity_id;
  switch (n.entity_type) {
    case "quo_quotation":
      return id ? `/app/crm/pipelines/quotations` : "/app/crm/pipelines/quotations";
    case "crm_warranty_asset":
      return "/app/crm/warranty-assets";
    case "inv_item":
      return "/app/crm/reports/low-stock";
    case "crm_follow_up_task":
      return "/app/crm/follow-up-tasks";
    case "sa_sales":
      return "/app/sales/sales";
    default:
      return "/app/crm/notifications";
  }
}

export function crmSeverityToastType(severity: CrmNotification["severity"]): "warning" | "error" | "success" {
  if (severity === "critical") return "error";
  if (severity === "warning") return "warning";
  return "success";
}
