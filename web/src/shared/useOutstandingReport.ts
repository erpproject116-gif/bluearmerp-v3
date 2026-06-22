import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";
import type { OutstandingQuoteFilters } from "../modules/quotation/quotation/quotationStatusFilters";
import { outstandingToSearchParams } from "../modules/quotation/quotation/quotationStatusFilters";

export type OutstandingReportRow = {
  quotation_id: number;
  line_id: number;
  date_no_display: string;
  reference_no: string;
  progress_status: string;
  customer_name: string;
  location_name: string;
  item_code: string;
  item_name: string;
  qty: number;
  balance_qty: number;
  location_stock: number;
  total_stock: number;
  valid_until?: string | null;
  line_total: number;
};

export type OutstandingReportParams = {
  filters: OutstandingQuoteFilters;
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  enabled: boolean;
};

export function useOutstandingReport(params: () => OutstandingReportParams) {
  return createQuery(() => {
    const p = params();
    const qs = outstandingToSearchParams(p.filters, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });
    return {
      queryKey: ["quotation-outstanding-report", p],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<{ rows: OutstandingReportRow[]; summary: { total_balance_qty: number; total_amount: number } }>(
          `/api/v1/quotation/quotations/outstanding-report?${qs}`,
        );
        if (!res.success) throw new Error(res.message ?? "Failed to load outstanding report");
        return {
          rows: res.data?.rows ?? [],
          summary: res.data?.summary ?? { total_balance_qty: 0, total_amount: 0 },
          total: res.meta?.total ?? 0,
          page: res.meta?.page ?? p.page,
          perPage: res.meta?.per_page ?? p.pageSize,
        };
      },
      staleTime: 15_000,
    };
  });
}

export function useInvalidateOutstandingReport() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["quotation-outstanding-report"] });
}
