import { apiFetch, type ApiResult } from "./api";

export type SalesInvoice = {
  sales_id: number;
  sales_no: string;
  order_date: string;
  partner_name: string;
  tax_type_name: string;
  pretax_amount: number;
  tax: number;
  grand_total: number;
  fees: number;
  remark: string;
  sales_account_id: number | null;
  sales_account: string;
  deposit_account_id: number | null;
  deposit_account: string;
  journal_entry_id: number | null;
  journal_entry_no: string;
  journal_status: string;
};

export type PurchaseInvoice = {
  supplier_invoice_id: number;
  invoice_no: string;
  invoice_date: string;
  partner_name: string;
  pretax_amount: number;
  tax: number;
  grand_total: number;
  fees: number;
  remark: string;
  purchase_account_id: number | null;
  purchase_account: string;
  withdrawal_account_id: number | null;
  withdrawal_account: string;
  journal_entry_id: number | null;
  journal_entry_no: string;
  journal_status: string;
};

export function getSalesInvoice(id: number): Promise<ApiResult<SalesInvoice>> {
  return apiFetch<SalesInvoice>(`/api/v1/sales/${id}/invoice`, {}, { silent: true });
}

export function saveSalesInvoice(
  id: number,
  body: { sales_account_id: number; deposit_account_id: number; fees: number; remark: string },
): Promise<ApiResult<{ journal_entry_id: number }>> {
  return apiFetch(`/api/v1/sales/${id}/invoice`, { method: "PUT", body: JSON.stringify(body) });
}

export function getPurchaseInvoice(id: number): Promise<ApiResult<PurchaseInvoice>> {
  return apiFetch<PurchaseInvoice>(`/api/v1/finance/supplier-invoices/${id}/invoice`, {}, { silent: true });
}

export function savePurchaseInvoice(
  id: number,
  body: { purchase_account_id: number; withdrawal_account_id: number; fees: number; remark: string },
): Promise<ApiResult<{ journal_entry_id: number }>> {
  return apiFetch(`/api/v1/finance/supplier-invoices/${id}/invoice`, { method: "PUT", body: JSON.stringify(body) });
}

type FinanceAccountDefaults = {
  sales_account_id?: number | null;
  purchase_account_id?: number | null;
  receivable_account_id?: number | null;
  payable_account_id?: number | null;
};

/**
 * When CoA defaults are mapped, save the purchase accounting voucher
 * (Purchases/COGS + A/P) so AP posts without a manual Invoice-tab save.
 * Mirrors sales invoice defaults behavior for the purchases side.
 */
export async function tryAutoSavePurchaseInvoice(supplierInvoiceId: number): Promise<boolean> {
  const existing = await getPurchaseInvoice(supplierInvoiceId);
  if (existing.success && existing.data?.purchase_account_id && existing.data?.withdrawal_account_id) {
    return true;
  }
  const defaults = await apiFetch<FinanceAccountDefaults>("/api/v1/finance/accounts/defaults", {}, { silent: true });
  const purchaseId = defaults.data?.purchase_account_id;
  const payableId = defaults.data?.payable_account_id;
  if (!purchaseId || !payableId) return false;
  const res = await savePurchaseInvoice(supplierInvoiceId, {
    purchase_account_id: purchaseId,
    withdrawal_account_id: payableId,
    fees: existing.data?.fees ?? 0,
    remark: existing.data?.remark ?? "",
  });
  return Boolean(res.success);
}

/**
 * When CoA defaults are mapped, save the sales accounting voucher
 * (Sales revenue + A/R) without a manual Invoice-tab save.
 */
export async function tryAutoSaveSalesInvoice(salesId: number): Promise<boolean> {
  const existing = await getSalesInvoice(salesId);
  // Already mapped with a journal — nothing to do.
  if (
    existing.success &&
    existing.data?.sales_account_id &&
    existing.data?.deposit_account_id &&
    existing.data?.journal_entry_id
  ) {
    return true;
  }
  const defaults = await apiFetch<FinanceAccountDefaults>("/api/v1/finance/accounts/defaults", {}, { silent: true });
  const salesAcct = defaults.data?.sales_account_id ?? existing.data?.sales_account_id ?? null;
  const arAcct = defaults.data?.receivable_account_id ?? existing.data?.deposit_account_id ?? null;
  if (!salesAcct || !arAcct) return false;
  const res = await saveSalesInvoice(salesId, {
    sales_account_id: salesAcct,
    deposit_account_id: arAcct,
    fees: existing.data?.fees ?? 0,
    remark: existing.data?.remark ?? "",
  });
  return Boolean(res.success);
}
