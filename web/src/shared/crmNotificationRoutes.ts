import type { CrmNotification, CrmNotificationSource } from "./useCrmNotifications";

/** Deep-link target for a CRM / activity notification entity. Prefers API href. */
export function crmNotificationHref(n: CrmNotification): string {
  if (n.href && n.href.startsWith("/")) return n.href;
  const id = n.entity_id;
  switch (n.entity_type) {
    case "quo_quotation":
      return id ? `/app/quotation/quotations?openId=${id}` : "/app/quotation/quotations";
    case "crm_warranty_asset":
      return id ? `/app/after-sales/warranty?openId=${id}` : "/app/after-sales/warranty";
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

export function crmSeverityToastType(severity: CrmNotification["severity"]): "warning" | "error" | "info" {
  if (severity === "critical") return "error";
  if (severity === "warning") return "warning";
  return "info";
}

export function crmNotificationSourceLabel(source?: CrmNotificationSource | string | null): string {
  switch (source) {
    case "rule":
      return "Alert";
    case "support":
      return "Support";
    case "system":
      return "System";
    case "activity":
    default:
      return "Activity";
  }
}

/** Compact relative time for bell/inbox rows. */
export function crmNotificationRelativeTime(iso: string, nowMs = Date.now()): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diffSec = Math.round((nowMs - t) / 1000);
  if (diffSec < 45) return "just now";
  if (diffSec < 3600) {
    const m = Math.floor(diffSec / 60);
    return `${m}m ago`;
  }
  if (diffSec < 86400) {
    const h = Math.floor(diffSec / 3600);
    return `${h}h ago`;
  }
  if (diffSec < 86400 * 7) {
    const d = Math.floor(diffSec / 86400);
    return `${d}d ago`;
  }
  return new Date(iso).toLocaleDateString();
}
