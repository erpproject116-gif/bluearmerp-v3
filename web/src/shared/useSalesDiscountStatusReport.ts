import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";
import type { SalesStatusFilters } from "../modules/sales/sales/salesStatusFilters";
import { filtersToSearchParams } from "../modules/sales/sales/salesStatusFilters";

export type SalesDiscountStatusRow = {
  sales_id: number;
  line_id: number;
  date_no_display: string;
  sales_no: string;
  customer_name: string;
  item_code: string;
  item_name: string;
  qty: number;
  discount_amount: number;
  line_total: number;
  remark?: string | null;
  location_name: string;
  department_name?: string;
};

export type SalesDiscountStatusParams = {
  filters: SalesStatusFilters;
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  enabled: boolean;
};

export function discountStatusExportUrl(filters: SalesStatusFilters): string {
  return `/api/v1/sales/discount-status-report/export?${filtersToSearchParams(filters).toString()}`;
}

export function useSalesDiscountStatusReport(params: () => SalesDiscountStatusParams) {
  return createQuery(() => {
    const p = params();
    const qs = filtersToSearchParams(p.filters, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });
    return {
      queryKey: ["sales-discount-status", p],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<{
          rows: SalesDiscountStatusRow[];
          summary: { total_qty: number; total_discount_amount: number; total_amount: number };
        }>(`/api/v1/sales/discount-status-report?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load discount status");
        return {
          rows: res.data?.rows ?? [],
          summary: res.data?.summary ?? { total_qty: 0, total_discount_amount: 0, total_amount: 0 },
          total: res.meta?.total ?? 0,
        };
      },
      staleTime: 15_000,
    };
  });
}

export function useInvalidateSalesDiscountStatusReport() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["sales-discount-status"] });
}
