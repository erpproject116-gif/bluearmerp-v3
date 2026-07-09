import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";
import type { PurchaseOrderStatusFilters } from "../modules/purchase-order/reports/purchaseOrderStatusFilters";
import { filtersToSearchParams } from "../modules/purchase-order/reports/purchaseOrderStatusFilters";

export type PurchaseOrderStatusReportRow = {
  purchase_order_id: number;
  line_id: number;
  date_no_display: string;
  purchase_order_no: string;
  progress_status: string;
  status: string;
  location_name: string;
  pic_name: string;
  vendor_name: string;
  tax_type_name: string;
  item_code: string;
  item_name: string;
  qty: number;
  received_qty: number;
  line_total: number;
  remark?: string | null;
};

export type PurchaseOrderStatusReportParams = {
  filters: PurchaseOrderStatusFilters;
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  enabled: boolean;
};

export function usePurchaseOrderStatusReport(params: () => PurchaseOrderStatusReportParams) {
  return createQuery(() => {
    const p = params();
    const qs = filtersToSearchParams(p.filters, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });
    return {
      queryKey: ["purchase-order-status-report", p],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<{
          rows: PurchaseOrderStatusReportRow[];
          summary: { total_qty: number; total_amount: number };
        }>(`/api/v1/purchase-order/purchase-orders/status-report?${qs}`);
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

export function useInvalidatePurchaseOrderStatusReport() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["purchase-order-status-report"] });
}
