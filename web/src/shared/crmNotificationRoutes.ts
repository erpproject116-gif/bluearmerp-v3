import type { CrmNotification } from "./useCrmNotifications";

/** Deep-link target for a CRM / activity notification entity. */
export function crmNotificationHref(n: CrmNotification): string {
  const id = n.entity_id;
  switch (n.entity_type) {
    case "quo_quotation":
      return "/app/quotation/quotations";
    case "crm_warranty_asset":
      return "/app/crm/warranty-assets";
    case "inv_item":
    case "inv_item_location_balance":
      return "/app/crm/reports/low-stock";
    case "crm_follow_up_task":
      return "/app/crm/follow-up-tasks";
    case "sa_sales":
      return id ? `/app/sales/sales?openId=${id}` : "/app/sales/sales";
    case "so_sales_order":
    case "sa_sales_order":
      return "/app/sales-order/sales-orders";
    case "fin_supplier_invoice":
      return id ? `/app/purchases/purchase-receive?openId=${id}` : "/app/purchases/purchase-receive";
    case "po_purchase_order":
      return "/app/purchase-request/purchase-orders";
    case "support_ticket":
    case "support_ticket_attachment":
    case "sup_support_ticket":
    case "sup_support_ticket_attachment":
      return id ? `/app/support/tickets/${id}` : "/app/support/tickets";
    case "fin_account":
      return "/app/finance/acct-i/chart-of-accounts";
    case "wm_work_item":
      return "/app/operations";
    default:
      return "/app/crm/notifications";
  }
}

export function crmSeverityToastType(severity: CrmNotification["severity"]): "warning" | "error" | "success" {
  if (severity === "critical") return "error";
  if (severity === "warning") return "warning";
  return "success";
}
