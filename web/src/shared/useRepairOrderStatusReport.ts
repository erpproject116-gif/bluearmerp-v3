import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";
import type { RepairOrderStatusFilters } from "../modules/inventory/after-sales/repairOrderStatusFilters";
import { filtersToSearchParams } from "../modules/inventory/after-sales/repairOrderStatusFilters";

export type StatusReportRow = {
  repair_order_id: number;
  line_id: number;
  date_no_display: string;
  repair_order_no: string;
  progress_status: string;
  location_name: string;
  pic_name: string;
  customer_name: string;
  latest_update?: string | null;
  item_code: string;
  item_name_display: string;
  qty: number;
  remark?: string | null;
};

export type StatusReportListParams = {
  filters: RepairOrderStatusFilters;
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  enabled: boolean;
};

export function useRepairOrderStatusReport(params: () => StatusReportListParams) {
  return createQuery(() => {
    const p = params();
    const qs = filtersToSearchParams(p.filters, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });
    return {
      queryKey: ["repair-order-status-report", p],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<{ rows: StatusReportRow[]; summary: { total_qty: number } }>(
          `/api/v1/inventory/repair-orders/status-report?${qs}`,
        );
        if (!res.success) throw new Error(res.message ?? "Failed to load status report");
        return {
          rows: res.data?.rows ?? [],
          summary: res.data?.summary ?? { total_qty: 0 },
          total: res.meta?.total ?? 0,
          page: res.meta?.page ?? p.page,
          perPage: res.meta?.per_page ?? p.pageSize,
        };
      },
      staleTime: 15_000,
    };
  });
}

export function useInvalidateStatusReport() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["repair-order-status-report"] });
}

export async function patchRepairOrderProgress(repairOrderId: number, progressStatus: "received" | "finished") {
  return apiFetch(`/api/v1/inventory/repair-orders/${repairOrderId}/progress-status`, {
    method: "PATCH",
    body: JSON.stringify({ progress_status: progressStatus }),
  });
}
