import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";
import type { PurchaseRequestStatusFilters } from "../modules/purchase-request/purchase-request/purchaseRequestStatusFilters";
import { filtersToSearchParams } from "../modules/purchase-request/purchase-request/purchaseRequestStatusFilters";

export type PurchaseRequestStatusReportRow = {
  purchase_request_id: number;
  line_id: number;
  date_no_display: string;
  purchase_request_no: string;
  progress_status: string;
  send_status: string;
  domestic_foreign: string;
  location_name: string;
  pic_name: string;
  partner_name: string;
  item_code: string;
  item_name: string;
  spec_name?: string | null;
  qty: number;
  line_total: number;
  remark?: string | null;
};

export type PurchaseRequestStatusReportParams = {
  filters: PurchaseRequestStatusFilters;
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  enabled: boolean;
};

export function usePurchaseRequestStatusReport(params: () => PurchaseRequestStatusReportParams) {
  return createQuery(() => {
    const p = params();
    const qs = filtersToSearchParams(p.filters, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });
    return {
      queryKey: ["purchase-request-status-report", p],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<{ rows: PurchaseRequestStatusReportRow[]; summary: { total_qty: number; total_amount: number } }>(
          `/api/v1/purchase-request/purchase-requests/status-report?${qs}`,
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

export function useInvalidatePurchaseRequestStatusReport() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["purchase-request-status-report"] });
}

export async function patchPurchaseRequestProgressFromReport(purchaseRequestId: number, progressStatus: string) {
  return apiFetch(`/api/v1/purchase-request/purchase-requests/${purchaseRequestId}/progress-status`, {
    method: "PATCH",
    body: JSON.stringify({ progress_status: progressStatus }),
  });
}
