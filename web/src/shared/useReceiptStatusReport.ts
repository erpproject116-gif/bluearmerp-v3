import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type ReceiptStatusFilters = {
  date_from?: string;
  date_to?: string;
  partner_id?: number | null;
  location_id?: number | null;
  department_id?: number | null;
  project_id?: number | null;
  pic_user_id?: number | null;
  receipt_status?: string;
};

export type ReceiptStatusReportRow = {
  sales_id: number;
  line_id: number;
  date_no_display: string;
  sales_no: string;
  customer_name: string;
  partner_id: number;
  grand_total: number;
  received_amount: number;
  balance: number;
  receipt_status: string;
  item_code: string;
  item_name: string;
  qty: number;
  line_total: number;
};

export type ReceiptStatusParams = {
  filters: ReceiptStatusFilters;
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  enabled: boolean;
};

export function receiptStatusFiltersToSearchParams(
  filters: ReceiptStatusFilters,
  extra?: { page?: number; pageSize?: number; sort?: string; order?: string },
): URLSearchParams {
  const qs = new URLSearchParams();
  if (filters.date_from) qs.set("date_from", filters.date_from);
  if (filters.date_to) qs.set("date_to", filters.date_to);
  if (filters.partner_id) qs.set("partner_id", String(filters.partner_id));
  if (filters.location_id) qs.set("location_id", String(filters.location_id));
  if (filters.department_id) qs.set("department_id", String(filters.department_id));
  if (filters.project_id) qs.set("project_id", String(filters.project_id));
  if (filters.pic_user_id) qs.set("pic_user_id", String(filters.pic_user_id));
  if (filters.receipt_status) qs.set("receipt_status", filters.receipt_status);
  if (extra?.page) qs.set("page", String(extra.page));
  if (extra?.pageSize) qs.set("pageSize", String(extra.pageSize));
  if (extra?.sort) qs.set("sort", extra.sort);
  if (extra?.order) qs.set("order", extra.order);
  return qs;
}

export function receiptStatusExportUrl(filters: ReceiptStatusFilters): string {
  return `/api/v1/finance/receipt-status/export?${receiptStatusFiltersToSearchParams(filters).toString()}`;
}

export function useReceiptStatusReport(params: () => ReceiptStatusParams) {
  return createQuery(() => {
    const p = params();
    const qs = receiptStatusFiltersToSearchParams(p.filters, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });
    return {
      queryKey: ["receipt-status", p],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<{
          rows: ReceiptStatusReportRow[];
          summary: { total_qty: number; total_amount: number };
        }>(`/api/v1/finance/receipt-status?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load receipt status");
        return {
          rows: res.data?.rows ?? [],
          summary: res.data?.summary ?? { total_qty: 0, total_amount: 0 },
          total: res.meta?.total ?? 0,
          page: res.meta?.page ?? p.page,
          perPage: res.meta?.per_page ?? p.pageSize,
        };
      },
      staleTime: 15_000,
    };
  });
}

export function useInvalidateReceiptStatusReport() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["receipt-status"] });
}
