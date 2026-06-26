import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

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
};

export function useCrmTaskSummaries(params: () => {
  quotationIds?: number[];
  salesIds?: number[];
  warrantyIds?: number[];
  enabled?: boolean;
}) {
  return createQuery(() => {
    const p = params();
    const qIds = p.quotationIds ?? [];
    const sIds = p.salesIds ?? [];
    const wIds = p.warrantyIds ?? [];
    const enabled = p.enabled !== false && (qIds.length > 0 || sIds.length > 0 || wIds.length > 0);
    return {
      queryKey: ["crm-task-summaries", qIds, sIds, wIds],
      enabled,
      queryFn: async () => {
        const res = await apiFetch<FollowUpTaskSummaries>("/api/v1/crm/follow-up-tasks/summaries", {
          method: "POST",
          body: JSON.stringify({
            quotation_ids: qIds,
            sales_ids: sIds,
            warranty_asset_ids: wIds,
          }),
        }, { silent: true });
        if (!res.success) throw new Error(res.message ?? "Failed to load CRM task summaries");
        return res.data ?? { by_quotation: {}, by_sales: {}, by_warranty: {} };
      },
      staleTime: 15_000,
    };
  });
}

export function useInvalidateCrmTaskSummaries() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["crm-task-summaries"] });
}
