import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type CollectiveInvoiceRow = {
  id: number;
  invoice_date: string;
  date_seq: number;
  date_no_display: string;
  accounting_slip_no?: string;
  receivable_no?: string;
  partner_id: number;
  customer_name: string;
  status: string;
  source: string;
  subtotal: number;
  tax_total: number;
  grand_total: number;
  due_date?: string;
  display_receivable_no?: string;
  sales_count?: number;
};

export type CollectiveInvoiceListParams = {
  page: number;
  pageSize: number;
  sort: string;
  order: string;
  q?: string;
  status?: string;
};

export function useCollectiveInvoices(params: () => CollectiveInvoiceListParams) {
  return createQuery(() => {
    const p = params();
    const qs = new URLSearchParams({
      page: String(p.page),
      pageSize: String(p.pageSize),
      sort: p.sort,
      order: p.order,
    });
    if (p.q?.trim()) qs.set("q", p.q.trim());
    if (p.status?.trim()) qs.set("status", p.status.trim());
    return {
      queryKey: ["collective-invoices", p],
      queryFn: async () => {
        const res = await apiFetch<CollectiveInvoiceRow[]>(`/api/v1/sales/collective-invoices?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load collective invoices");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 15_000,
    };
  });
}

export function useInvalidateCollectiveInvoices() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["collective-invoices"] });
}

export async function createCollectiveInvoice(salesIds: number[], invoiceDate?: string) {
  return apiFetch<CollectiveInvoiceRow>("/api/v1/sales/collective-invoices", {
    method: "POST",
    body: JSON.stringify({ sales_ids: salesIds, invoice_date: invoiceDate || undefined }),
  });
}

export async function autoBatchCollectiveInvoices(orderDate?: string) {
  const qs = orderDate ? `?order_date=${encodeURIComponent(orderDate)}` : "";
  return apiFetch<{ created: number; skipped: number; invoices: CollectiveInvoiceRow[] }>(
    `/api/v1/sales/collective-invoices/auto-batch${qs}`,
    { method: "POST" },
  );
}

export type CollectiveTransactionRow = {
  collective_invoice_id: number;
  invoicing_date_no_display: string;
  transaction_date_no_display: string;
  sales_id: number;
  line_id: number;
  item_name_spec: string;
  qty: number;
  price: number;
  pretax_amount: number;
  tax: number;
  total: number;
  customer_name: string;
};

export async function fetchCollectiveInvoiceTransactions(id: number) {
  return apiFetch<{ header: Record<string, unknown>; rows: CollectiveTransactionRow[] }>(
    `/api/v1/sales/collective-invoices/${id}/transactions`,
  );
}

export function collectiveTransactionsExportUrl(id: number) {
  return `/api/v1/sales/collective-invoices/${id}/transactions/export`;
}
