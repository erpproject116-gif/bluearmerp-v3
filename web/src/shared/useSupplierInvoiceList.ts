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
  progress_status: string;
  created_by_name?: string;
};

export type SupplierInvoiceLine = {
  id?: number;
  line_no: number;
  goods_receipt_line_id?: number | null;
  purchase_order_line_id?: number | null;
  item_id?: number | null;
  item_code?: string;
  item_name?: string;
  description?: string | null;
  qty: number;
  unit_non_vat: number;
  non_vat_total: number;
  tax_amount: number;
  unit_vat_inc: number;
  line_total: number;
  remark?: string | null;
  track_serial?: boolean;
};

export type SupplierInvoiceDetail = SupplierInvoiceRow & {
  tax_type_id?: number | null;
  tax_type_name?: string;
  currency_id: number;
  pic_user_id?: number | null;
  pic_name?: string;
  location_id?: number | null;
  location_name?: string;
  project_id?: number | null;
  project_name?: string | null;
  due_date?: string | null;
  terms_of_payment?: string | null;
  payment_terms?: string | null;
  reference?: string | null;
  notes?: string | null;
  subtotal: number;
  tax_total: number;
  lines?: SupplierInvoiceLine[];
};

export type OpenGRLine = {
  goods_receipt_line_id: number;
  goods_receipt_id: number;
  purchase_order_line_id?: number;
  purchase_order_no: string;
  item_id?: number;
  item_code: string;
  item_name: string;
  balance_qty: number;
  unit_non_vat: number;
  unit_vat_inc: number;
};

export type OpenPOLine = {
  purchase_order_line_id: number;
  purchase_order_id: number;
  purchase_order_no: string;
  item_id: number;
  item_code: string;
  item_name: string;
  ordered_qty: number;
  billed_qty: number;
  balance_qty: number;
  unit_non_vat: number;
  unit_vat_inc: number;
  track_serial?: boolean;
};

export type OpenSupplierQuotationInvoiceLine = OpenPOLine & {
  supplier_quotation_id: number;
  supplier_quotation_line_id: number;
  quote_no: string;
  rfq_id: number;
};

export function useSupplierInvoiceList(params: () => {
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  q?: string;
  progressStatus?: string;
  paymentStatus?: string;
}) {
  return createQuery(() => {
    const p = params();
    const qs = new URLSearchParams({ page: String(p.page), pageSize: String(p.pageSize), sort: p.sort, order: p.order });
    if (p.q) qs.set("q", p.q);
    if (p.progressStatus) qs.set("progress_status", p.progressStatus);
    if (p.paymentStatus) qs.set("payment_status", p.paymentStatus);
    return {
      queryKey: ["supplier-invoices", p],
      queryFn: async () => {
        const res = await apiFetch<SupplierInvoiceRow[]>(`/api/v1/finance/supplier-invoices?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 30_000,
      placeholderData: (prev) => prev,
    };
  });
}

export function useInvalidateSupplierInvoices() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["supplier-invoices"] });
}
