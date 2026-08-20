/** App routes for audit log target types (clickable references). */
export function entityRecordHref(targetType: string, targetId: number): string | null {
  switch (targetType) {
    case "quo_quotation":
      return `/app/quotation/quotations?open=${targetId}`;
    case "so_sales_order":
      return `/app/sales-order/sales-orders?open=${targetId}`;
    case "sa_sales":
      return `/app/sales/sales?open=${targetId}`;
    case "fin_official_receipt":
      return `/app/finance/official-receipts?open=${targetId}`;
    case "fin_payment_voucher":
      return `/app/finance/payment-vouchers?open=${targetId}`;
    case "inv_stock_adjustment_request":
      return "/app/inventory/stock-adjustments";
    case "po_purchase_order":
      return `/app/purchase-order/purchase-orders?open=${targetId}`;
    case "fin_supplier_invoice":
      return `/app/purchases/purchase-receive?openId=${targetId}`;
    case "inv_repair_order":
      return `/app/after-sales/repair-orders?open=${targetId}`;
    case "inv_repair_registration":
      return `/app/after-sales/register-repair?open=${targetId}`;
    case "inv_partner":
      return `/app/inventory/partners?open=${targetId}`;
    case "inv_item":
      return `/app/inventory/items?open=${targetId}`;
    case "crm_warranty_asset":
      return `/app/after-sales/warranty?open=${targetId}`;
    case "crm_follow_up_task":
      return `/app/crm/follow-up-tasks?task=${targetId}`;
    default:
      return null;
  }
}

export function activityLogHref(opts: {
  module?: string;
  targetType?: string;
  targetId?: number;
  referenceNo?: string;
}): string {
  const qs = new URLSearchParams();
  if (opts.module) qs.set("module", opts.module);
  if (opts.targetType) qs.set("target_type", opts.targetType);
  if (opts.targetId != null) qs.set("target_id", String(opts.targetId));
  if (opts.referenceNo) qs.set("reference_no", opts.referenceNo);
  const q = qs.toString();
  return q ? `/app/activity-logs?${q}` : "/app/activity-logs";
}

export function changeLogHref(opts: {
  module?: string;
  targetType?: string;
  targetId?: number;
  referenceNo?: string;
}): string {
  const qs = new URLSearchParams();
  if (opts.module) qs.set("module", opts.module);
  if (opts.targetType) qs.set("target_type", opts.targetType);
  if (opts.targetId != null) qs.set("target_id", String(opts.targetId));
  if (opts.referenceNo) qs.set("reference_no", opts.referenceNo);
  const q = qs.toString();
  return q ? `/app/activity-logs/changes?${q}` : "/app/activity-logs/changes";
}
