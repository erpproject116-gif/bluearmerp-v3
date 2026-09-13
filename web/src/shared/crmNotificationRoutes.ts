import type { CrmNotification, CrmNotificationSource } from "./useCrmNotifications";

function entityDeepLink(entityType: string, id: number): string | null {
  switch (entityType) {
    case "quo_quotation":
    case "quotation":
      return `/app/quotation/quotations?openId=${id}`;
    case "crm_warranty_asset":
      return `/app/after-sales/warranty?openId=${id}`;
    case "sa_sales":
    case "sales":
    case "sa_sale":
      return `/app/sales/sales?openId=${id}`;
    case "so_sales_order":
    case "sa_sales_order":
    case "sales_order":
      return `/app/sales-order/sales-orders?openId=${id}`;
    case "fin_supplier_invoice":
    case "supplier_invoice":
      return `/app/purchases/purchase-receive?openId=${id}`;
    case "po_purchase_order":
    case "purchase_order":
      return `/app/purchase-order/purchase-orders?openId=${id}`;
    case "pr_purchase_request":
    case "purchase_request":
      return `/app/purchase-request/purchase-requests?openId=${id}`;
    case "rfq_request":
      return `/app/purchase-order/rfq/${id}`;
    case "gr_goods_receipt":
      return `/app/purchases/purchase-receive?openId=${id}`;
    case "mfg_work_order":
      return `/app/production/assembly/jobs?openId=${id}`;
    case "mfg_bom":
      return `/app/production/recipe/recipes?openId=${id}`;
    case "chat_message":
      return `/app/comms/chat?messageId=${id}`;
    case "meeting":
      return "/app/operations/calendar";
    case "support_ticket":
    case "support_ticket_attachment":
    case "sup_support_ticket":
    case "sup_support_ticket_attachment":
      return `/app/support/tickets/${id}`;
    case "fin_payment_voucher":
      return `/app/finance/payment-vouchers?openId=${id}`;
    case "fin_official_receipt":
      return `/app/finance/official-receipts?openId=${id}`;
    default:
      return null;
  }
}

function listPathForEntityType(entityType: string): string | null {
  switch (entityType) {
    case "quo_quotation":
    case "quotation":
      return "/app/quotation/quotations";
    case "crm_warranty_asset":
      return "/app/after-sales/warranty";
    case "sa_sales":
    case "sales":
    case "sa_sale":
      return "/app/sales/sales";
    case "so_sales_order":
    case "sa_sales_order":
    case "sales_order":
      return "/app/sales-order/sales-orders";
    case "fin_supplier_invoice":
    case "supplier_invoice":
      return "/app/purchases/purchase-receive";
    case "po_purchase_order":
    case "purchase_order":
      return "/app/purchase-order/purchase-orders";
    case "pr_purchase_request":
    case "purchase_request":
      return "/app/purchase-request/purchase-requests";
    case "rfq_request":
      return "/app/purchase-order/rfq";
    case "gr_goods_receipt":
      return "/app/purchases/purchase-receive";
    case "mfg_work_order":
      return "/app/production/assembly/jobs";
    case "mfg_bom":
      return "/app/production/recipe/recipes";
    case "chat_message":
      return "/app/comms/chat";
    case "support_ticket":
    case "sup_support_ticket":
      return "/app/support/tickets";
    case "inv_item":
    case "inv_item_location_balance":
      return "/app/crm/reports/low-stock";
    case "crm_follow_up_task":
      return "/app/crm/follow-up-tasks";
    case "inv_stock_adjustment_request":
    case "inv_serial_adjustment_request":
      return "/app/inventory/stock-adjustments";
    case "fin_account":
      return "/app/finance/acct-i/chart-of-accounts";
    case "wm_work_item":
      return "/app/operations";
    case "meeting":
      return "/app/operations/calendar";
    default:
      return null;
  }
}

/** Deep-link target for a CRM / activity notification entity. Prefers API href. */
export function crmNotificationHref(n: CrmNotification): string {
  if (n.href && n.href.startsWith("/")) return n.href;
  const et = (n.entity_type ?? "").trim();
  const id = n.entity_id && n.entity_id > 0 ? n.entity_id : 0;
  const listOnly = listPathForEntityType(et);
  if (
    listOnly &&
    (et === "inv_item" ||
      et === "inv_item_location_balance" ||
      et === "crm_follow_up_task" ||
      et === "inv_stock_adjustment_request" ||
      et === "inv_serial_adjustment_request" ||
      et === "fin_account" ||
      et === "wm_work_item")
  ) {
    return listOnly;
  }
  if (id > 0) {
    const deep = entityDeepLink(et, id);
    if (deep) return deep;
    const qs = new URLSearchParams({ target_type: et || "_", target_id: String(id) });
    return `/app/activity-logs/changes?${qs.toString()}`;
  }
  const list = listPathForEntityType(et);
  if (list) return list;
  return "/app/crm/notifications";
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
    case "chat":
      return "Chat";
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
