import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";
import { listFiltersToSearchParams } from "../modules/purchase-request/purchase-request/purchaseRequestListFilters";

export type PurchaseRequestListParams = {
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  q?: string;
  progressStatus?: string;
  date_from?: string;
  date_to?: string;
  purchase_request_no?: string;
  domestic_foreign?: string;
  location_id?: number;
  project_id?: number;
  partner_id?: number;
  item_id?: number;
  send_status?: string;
  sort_by_modified?: boolean;
};

export type PurchaseRequestRow = {
  id: number;
  request_date: string;
  date_seq: number;
  date_no_display: string;
  purchase_request_no: string;
  tax_type_id: number;
  tax_type_name: string;
  currency_id: number;
  currency_code: string;
  partner_id?: number | null;
  partner_name: string;
  pic_user_id?: number | null;
  pic_name: string;
  location_id: number;
  domestic_foreign: string;
  send_status: string;
  progress_status: string;
  total_qty: number;
  grand_total: number;
  created_by_name?: string;
  item_name_summary?: string;
};

export function usePurchaseRequestList(params: () => PurchaseRequestListParams) {
  return createQuery(() => {
    const p = params();
    const filters = {
      date_from: p.date_from ?? "",
      date_to: p.date_to ?? "",
      q: p.q,
      progress_status: p.progressStatus,
      purchase_request_no: p.purchase_request_no,
      domestic_foreign: (p.domestic_foreign as "domestic" | "foreign" | "all" | undefined) ?? "all",
      send_status: (p.send_status as "all" | "unsent" | "sent" | undefined) ?? "all",
      location_id: p.location_id,
      project_id: p.project_id,
      partner_id: p.partner_id,
      item_id: p.item_id,
      sort_by_modified: p.sort_by_modified,
    };
    const qs = listFiltersToSearchParams(filters, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });

    return {
      queryKey: ["purchase-requests", p],
      enabled: Boolean(p.date_from && p.date_to),
      queryFn: async () => {
        const res = await apiFetch<PurchaseRequestRow[]>(`/api/v1/purchase-request/purchase-requests?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load");
        return {
          rows: res.data ?? [],
          total: res.meta?.total ?? 0,
          page: res.meta?.page ?? p.page,
          perPage: res.meta?.per_page ?? p.pageSize,
        };
      },
      staleTime: 30_000,
      placeholderData: (prev) => prev,
    };
  });
}

export function useInvalidatePurchaseRequests() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["purchase-requests"] });
}

export async function patchPurchaseRequestProgress(purchaseRequestId: number, progressStatus: string) {
  return apiFetch(`/api/v1/purchase-request/purchase-requests/${purchaseRequestId}/progress-status`, {
    method: "PATCH",
    body: JSON.stringify({ progress_status: progressStatus }),
  });
}
