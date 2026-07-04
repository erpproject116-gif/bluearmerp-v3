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
