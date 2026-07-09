import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";
import type { OutstandingPOFilters } from "../modules/purchase-order/reports/purchaseOrderStatusFilters";
import { outstandingToSearchParams } from "../modules/purchase-order/reports/purchaseOrderStatusFilters";

export type PurchaseOrderOutstandingReportRow = {
  purchase_order_id: number;
  line_id: number;
  date_no_display: string;
  purchase_order_no: string;
  progress_status: string;
  status: string;
  vendor_name: string;
  location_name: string;
  item_code: string;
  item_name: string;
  qty: number;
  balance_qty: number;
  line_total: number;
};

export type PurchaseOrderOutstandingReportParams = {
  filters: OutstandingPOFilters;
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  enabled: boolean;
};

export function usePurchaseOrderOutstandingReport(params: () => PurchaseOrderOutstandingReportParams) {
  return createQuery(() => {
    const p = params();
    const qs = outstandingToSearchParams(p.filters, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });
    return {
      queryKey: ["purchase-order-outstanding-report", p],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<{
          rows: PurchaseOrderOutstandingReportRow[];
          summary: { total_balance_qty: number; total_amount: number };
        }>(`/api/v1/purchase-order/purchase-orders/outstanding-report?${qs}`);
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

export function useInvalidatePurchaseOrderOutstandingReport() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["purchase-order-outstanding-report"] });
}
