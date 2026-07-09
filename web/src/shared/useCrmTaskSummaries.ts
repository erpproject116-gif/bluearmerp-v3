import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";
import { queryErrorFromApi, shouldRetryQuery } from "./queryRetry";

export type FollowUpTaskSummary = {
  open_count: number;
  latest_task_id?: number | null;
  latest_title?: string;
  latest_notes?: string | null;
  latest_stage?: string;
};

export type FollowUpTaskSummaries = {
  by_quotation: Record<string, FollowUpTaskSummary>;
  by_sales: Record<string, FollowUpTaskSummary>;
  by_warranty: Record<string, FollowUpTaskSummary>;
  by_purchase_request: Record<string, FollowUpTaskSummary>;
};

function stableIdKey(ids: number[]): string {
  if (ids.length === 0) return "";
  return [...ids].sort((a, b) => a - b).join(",");
}

export function useCrmTaskSummaries(params: () => {
  quotationIds?: number[];
  salesIds?: number[];
  warrantyIds?: number[];
  purchaseRequestIds?: number[];
  enabled?: boolean;
}) {
  return createQuery(() => {
    const p = params();
    const qIds = p.quotationIds ?? [];
    const sIds = p.salesIds ?? [];
    const wIds = p.warrantyIds ?? [];
    const prIds = p.purchaseRequestIds ?? [];
    const enabled = p.enabled !== false && (qIds.length > 0 || sIds.length > 0 || wIds.length > 0 || prIds.length > 0);
    return {
      queryKey: [
        "crm-task-summaries",
        stableIdKey(qIds),
        stableIdKey(sIds),
        stableIdKey(wIds),
        stableIdKey(prIds),
      ],
      enabled,
      queryFn: async () => {
        const res = await apiFetch<FollowUpTaskSummaries>("/api/v1/crm/follow-up-tasks/summaries", {
          method: "POST",
          body: JSON.stringify({
            quotation_ids: qIds,
            sales_ids: sIds,
            warranty_asset_ids: wIds,
            purchase_request_ids: prIds,
          }),
        }, { silent: true });
        if (!res.success) throw queryErrorFromApi(res.status, res.message ?? "Failed to load CRM task summaries");
        return res.data ?? { by_quotation: {}, by_sales: {}, by_warranty: {}, by_purchase_request: {} };
      },
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: shouldRetryQuery,
    };
  });
}

export function useInvalidateCrmTaskSummaries() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["crm-task-summaries"] });
}
