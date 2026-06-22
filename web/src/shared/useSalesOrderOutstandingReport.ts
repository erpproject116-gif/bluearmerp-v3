import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";
import type { OutstandingSOFilters } from "../modules/sales-order/sales-order/salesOrderStatusFilters";
import { outstandingToSearchParams } from "../modules/sales-order/sales-order/salesOrderStatusFilters";

export type SalesOrderOutstandingReportRow = {
  sales_order_id: number;
  line_id: number;
  date_no_display: string;
  sales_order_no: string;
  progress_status: string;
  customer_name: string;
  location_name: string;
  item_code: string;
  item_name: string;
  qty: number;
  balance_qty: number;
  location_stock: number;
  total_stock: number;
  delivery_date?: string | null;
  line_total: number;
};

export type SalesOrderOutstandingReportParams = {
  filters: OutstandingSOFilters;
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  enabled: boolean;
};

export function useSalesOrderOutstandingReport(params: () => SalesOrderOutstandingReportParams) {
  return createQuery(() => {
    const p = params();
    const qs = outstandingToSearchParams(p.filters, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });
    return {
      queryKey: ["sales-order-outstanding-report", p],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<{ rows: SalesOrderOutstandingReportRow[]; summary: { total_balance_qty: number; total_amount: number } }>(
          `/api/v1/sales-order/sales-orders/outstanding-report?${qs}`,
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

export function useInvalidateSalesOrderOutstandingReport() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["sales-order-outstanding-report"] });
}
