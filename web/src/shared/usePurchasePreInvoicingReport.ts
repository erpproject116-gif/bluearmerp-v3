import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type PurchasePreInvoicingRow = {
  goods_receipt_id: number;
  goods_receipt_line_id: number;
  purchase_order_no: string;
  receipt_date: string;
  date_no_display: string;
  vendor_name: string;
  partner_id: number;
  item_code: string;
  item_name: string;
  received_qty: number;
  billed_qty: number;
  balance_qty: number;
  unit_vat_inc: number;
  balance_amount: number;
};

export type PurchasePreInvoicingFilters = {
  date_from: string;
  date_to: string;
  as_of?: string;
  partner_id?: number | null;
};

export type PurchasePreInvoicingParams = {
  filters: PurchasePreInvoicingFilters;
  page: number;
  pageSize: number;
  enabled: boolean;
};

function filtersToQs(filters: PurchasePreInvoicingFilters, page: number, pageSize: number): URLSearchParams {
  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (filters.as_of) qs.set("as_of", filters.as_of);
  else {
    qs.set("date_from", filters.date_from);
    qs.set("date_to", filters.date_to);
  }
  if (filters.partner_id) qs.set("partner_id", String(filters.partner_id));
  return qs;
}

export function usePurchasePreInvoicingReport(params: () => PurchasePreInvoicingParams) {
  return createQuery(() => {
    const p = params();
    return {
      queryKey: ["purchase-pre-invoicing-report", p.filters, p.page, p.pageSize],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<{
          rows: PurchasePreInvoicingRow[];
          summary: { total_qty: number; total_amount: number };
        }>(`/api/v1/buying/reports/pre-invoicing?${filtersToQs(p.filters, p.page, p.pageSize)}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load pre-invoicing report");
        return {
          rows: res.data?.rows ?? [],
          summary: res.data?.summary ?? { total_qty: 0, total_amount: 0 },
          total: res.meta?.total ?? 0,
        };
      },
      staleTime: 30_000,
    };
  });
}

export function useInvalidatePurchasePreInvoicingReport() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["purchase-pre-invoicing-report"] });
}
