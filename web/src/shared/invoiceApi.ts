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

/** Result of auto-saving the accounting invoice voucher after Sales/Purchase create. */
export type InvoiceAutoSaveResult = {
  ok: boolean;
  /** posted | draft | already | skipped_defaults | failed */
  status: "posted" | "draft" | "already" | "skipped_defaults" | "failed";
  message: string;
  journal_entry_id?: number | null;
  journal_entry_no?: string | null;
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

const COA_HREF = "/app/finance/acct-i/chart-of-accounts#default-account-mappings";

/**
 * When CoA defaults are mapped, save the purchase accounting voucher
 * (Purchases/COGS + A/P) so AP posts without a manual Invoice-tab save.
 */
export async function tryAutoSavePurchaseInvoice(supplierInvoiceId: number): Promise<InvoiceAutoSaveResult> {
  const existing = await getPurchaseInvoice(supplierInvoiceId);
  if (existing.success && existing.data?.purchase_account_id && existing.data?.withdrawal_account_id) {
    const st = (existing.data.journal_status || "").toLowerCase();
    const je = {
      journal_entry_id: existing.data.journal_entry_id,
      journal_entry_no: existing.data.journal_entry_no || null,
    };
    if (existing.data.journal_entry_id && st === "posted") {
      return { ok: true, status: "posted", message: "Accounting journal already posted.", ...je };
    }
    if (existing.data.journal_entry_id) {
      return {
        ok: true,
        status: "draft",
        message: "Accounting journal is draft — post it under Journal Entries for Trial Balance.",
        ...je,
      };
    }
    return { ok: true, status: "already", message: "Purchase accounts already mapped.", ...je };
  }
  const defaults = await apiFetch<FinanceAccountDefaults>("/api/v1/finance/accounts/defaults", {}, { silent: true });
  const purchaseId = defaults.data?.purchase_account_id;
  const payableId = defaults.data?.payable_account_id;
  if (!purchaseId || !payableId) {
    return {
      ok: false,
      status: "skipped_defaults",
      message: `Map Purchases and A/P under Chart of Accounts defaults (${COA_HREF}) so this purchase hits the books.`,
    };
  }
  const res = await savePurchaseInvoice(supplierInvoiceId, {
    purchase_account_id: purchaseId,
    withdrawal_account_id: payableId,
    fees: existing.data?.fees ?? 0,
    remark: existing.data?.remark ?? "",
  });
  if (!res.success) {
    return { ok: false, status: "failed", message: res.message ?? "Failed to save purchase accounting voucher." };
  }
  const after = await getPurchaseInvoice(supplierInvoiceId);
  const st = (after.data?.journal_status || "").toLowerCase();
  const je = {
    journal_entry_id: after.data?.journal_entry_id ?? res.data?.journal_entry_id ?? null,
    journal_entry_no: after.data?.journal_entry_no || null,
  };
  if (st === "posted") {
    return { ok: true, status: "posted", message: "Purchase journal posted to the general ledger.", ...je };
  }
  return {
    ok: true,
    status: "draft",
    message: "Purchase journal created as draft — enable purchase auto-post or post under Journal Entries.",
    ...je,
  };
}

/**
 * When CoA defaults are mapped, save the sales accounting voucher
 * (Sales revenue + A/R) without a manual Invoice-tab save.
 */
export async function tryAutoSaveSalesInvoice(salesId: number): Promise<InvoiceAutoSaveResult> {
  const existing = await getSalesInvoice(salesId);
  if (
    existing.success &&
    existing.data?.sales_account_id &&
    existing.data?.deposit_account_id &&
    existing.data?.journal_entry_id
  ) {
    const st = (existing.data.journal_status || "").toLowerCase();
    const je = {
      journal_entry_id: existing.data.journal_entry_id,
      journal_entry_no: existing.data.journal_entry_no || null,
    };
    if (st === "posted") {
      return { ok: true, status: "posted", message: "Accounting journal already posted.", ...je };
    }
    return {
      ok: true,
      status: "draft",
      message: "Accounting journal is draft — post it under Journal Entries for Trial Balance.",
      ...je,
    };
  }
  const defaults = await apiFetch<FinanceAccountDefaults>("/api/v1/finance/accounts/defaults", {}, { silent: true });
  const salesAcct = defaults.data?.sales_account_id ?? existing.data?.sales_account_id ?? null;
  const arAcct = defaults.data?.receivable_account_id ?? existing.data?.deposit_account_id ?? null;
  if (!salesAcct || !arAcct) {
    return {
      ok: false,
      status: "skipped_defaults",
      message: `Map Sales and A/R under Chart of Accounts defaults (${COA_HREF}) so this sale hits the books.`,
    };
  }
  const res = await saveSalesInvoice(salesId, {
    sales_account_id: salesAcct,
    deposit_account_id: arAcct,
    fees: existing.data?.fees ?? 0,
    remark: existing.data?.remark ?? "",
  });
  if (!res.success) {
    return { ok: false, status: "failed", message: res.message ?? "Failed to save sales accounting voucher." };
  }
  const after = await getSalesInvoice(salesId);
  const st = (after.data?.journal_status || "").toLowerCase();
  const je = {
    journal_entry_id: after.data?.journal_entry_id ?? res.data?.journal_entry_id ?? null,
    journal_entry_no: after.data?.journal_entry_no || null,
  };
  if (st === "posted") {
    return { ok: true, status: "posted", message: "Sales journal posted to the general ledger.", ...je };
  }
  return {
    ok: true,
    status: "draft",
    message: "Sales journal created as draft — enable sales auto-post or post under Journal Entries.",
    ...je,
  };
}
