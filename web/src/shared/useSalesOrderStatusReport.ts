import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";
import type { SalesOrderStatusFilters } from "../modules/sales-order/sales-order/salesOrderStatusFilters";
import { filtersToSearchParams } from "../modules/sales-order/sales-order/salesOrderStatusFilters";

export type SalesOrderStatusReportRow = {
  sales_order_id: number;
  line_id: number;
  date_no_display: string;
  sales_order_no: string;
  progress_status: string;
  location_name: string;
  pic_name: string;
  customer_name: string;
  tax_type_name: string;
  delivery_date?: string | null;
  item_code: string;
  item_name: string;
  qty: number;
  line_total: number;
  remark?: string | null;
};

export type SalesOrderStatusReportParams = {
  filters: SalesOrderStatusFilters;
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  enabled: boolean;
};

export function useSalesOrderStatusReport(params: () => SalesOrderStatusReportParams) {
  return createQuery(() => {
    const p = params();
    const qs = filtersToSearchParams(p.filters, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });
    return {
      queryKey: ["sales-order-status-report", p],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<{ rows: SalesOrderStatusReportRow[]; summary: { total_qty: number; total_amount: number } }>(
          `/api/v1/sales-order/sales-orders/status-report?${qs}`,
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

export function useInvalidateSalesOrderStatusReport() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["sales-order-status-report"] });
}

export async function patchSalesOrderProgressFromReport(salesOrderId: number, progressStatus: string) {
  return apiFetch(`/api/v1/sales-order/sales-orders/${salesOrderId}/progress-status`, {
    method: "PATCH",
    body: JSON.stringify({ progress_status: progressStatus }),
  });
}
