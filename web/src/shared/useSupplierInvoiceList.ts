import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type SupplierInvoiceRow = {
  id: number;
  invoice_date: string;
  date_no_display: string;
  invoice_no: string;
  partner_id: number;
  vendor_name: string;
  currency_code: string;
  vendor_invoice_no?: string | null;
  grand_total: number;
};

export type SupplierInvoiceLine = {
  id?: number;
  line_no: number;
  goods_receipt_line_id?: number | null;
  item_code?: string;
  item_name?: string;
  qty: number;
  line_total: number;
};

export type SupplierInvoiceDetail = SupplierInvoiceRow & {
  currency_id: number;
  reference?: string | null;
  notes?: string | null;
  subtotal: number;
  tax_total: number;
  lines?: SupplierInvoiceLine[];
};

export type OpenGRLine = {
  goods_receipt_line_id: number;
  goods_receipt_id: number;
  purchase_order_no: string;
  item_code: string;
  item_name: string;
  balance_qty: number;
  unit_non_vat: number;
  unit_vat_inc: number;
};

export function useSupplierInvoiceList(params: () => { page: number; pageSize: number; sort: string; order: "asc" | "desc"; q?: string }) {
  return createQuery(() => {
    const p = params();
    const qs = new URLSearchParams({ page: String(p.page), pageSize: String(p.pageSize), sort: p.sort, order: p.order });
    if (p.q) qs.set("q", p.q);
    return {
      queryKey: ["supplier-invoices", p],
      queryFn: async () => {
        const res = await apiFetch<SupplierInvoiceRow[]>(`/api/v1/finance/supplier-invoices?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 30_000,
    };
  });
}

export function useInvalidateSupplierInvoices() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["supplier-invoices"] });
}
