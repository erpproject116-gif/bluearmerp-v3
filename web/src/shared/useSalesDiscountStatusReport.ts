import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";
import {
  filtersToSearchParams,
  type SalesDiscountStatusFilters,
} from "../modules/sales/reports/salesDiscountStatusFilters";

export type SalesDiscountStatusRow = {
  sales_id: number;
  order_date: string;
  date_no_display: string;
  customer_name: string;
  sales_amount: number;
  invoicing_amount: number;
  difference_amount: number;
  remark: string;
  progress_status: string;
  approval_line: string;
};

import type { SalesDiscountStatusTemplate } from "../modules/sales/reports/salesDiscountStatusTemplate";

export type SalesDiscountStatusParams = {
  filters: SalesDiscountStatusFilters;
  template: SalesDiscountStatusTemplate;
  page: number;
  pageSize: number;
  enabled: boolean;
};

export function discountStatusExportUrl(filters: SalesDiscountStatusFilters, template?: SalesDiscountStatusTemplate): string {
  const qs = filtersToSearchParams(filters, {
    sort: template?.sortField ?? "order_date",
    order: template?.sortOrder ?? "desc",
    sort2: template?.sortField2 || undefined,
    order2: template?.sortField2 ? template.sortOrder2 : undefined,
  });
  return `/api/v1/sales/discount-status-report/export?${qs}`;
}

export function useSalesDiscountStatusReport(params: () => SalesDiscountStatusParams) {
  return createQuery(() => {
    const p = params();
    const qs = filtersToSearchParams(p.filters, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.template.sortField,
      order: p.template.sortOrder,
      sort2: p.template.sortField2 || undefined,
      order2: p.template.sortField2 ? p.template.sortOrder2 : undefined,
    });
    return {
      queryKey: ["sales-discount-status", p],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<{
          rows: SalesDiscountStatusRow[];
          summary: {
            total_sales_amount: number;
            total_invoicing_amount: number;
            total_difference_amount: number;
          };
        }>(`/api/v1/sales/discount-status-report?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load discount status");
        return {
          rows: res.data?.rows ?? [],
          summary: res.data?.summary ?? {
            total_sales_amount: 0,
            total_invoicing_amount: 0,
            total_difference_amount: 0,
          },
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
