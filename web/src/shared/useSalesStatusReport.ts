import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";
import type { SalesStatusFilters } from "../modules/sales/sales/salesStatusFilters";
import { filtersToSearchParams } from "../modules/sales/sales/salesStatusFilters";

export type SalesStatusReportRow = {
  sales_id: number;
  line_id: number;
  date_no_display: string;
  sales_no: string;
  progress_status: string;
  location_name: string;
  pic_name: string;
  customer_name: string;
  tax_type_name: string;
  due_date?: string | null;
  item_code: string;
  item_name: string;
  qty: number;
  line_total: number;
  remark?: string | null;
};

export type SalesStatusReportParams = {
  filters: SalesStatusFilters;
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  enabled: boolean;
};

export function useSalesStatusReport(params: () => SalesStatusReportParams) {
  return createQuery(() => {
    const p = params();
    const qs = filtersToSearchParams(p.filters, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });
    return {
      queryKey: ["sales-status-report", p],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<{ rows: SalesStatusReportRow[]; summary: { total_qty: number; total_amount: number } }>(
          `/api/v1/sales/status-report?${qs}`,
        );
        if (!res.success) throw new Error(res.message ?? "Failed to load status report");
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

export function useInvalidateSalesStatusReport() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["sales-status-report"] });
}

export async function patchSalesProgressFromReport(salesId: number, progressStatus: string) {
  return apiFetch(`/api/v1/sales/${salesId}/progress-status`, {
    method: "PATCH",
    body: JSON.stringify({ progress_status: progressStatus }),
  });
}
