import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type ActivityLogRow = {
  id: number;
  actor_user_id?: number | null;
  actor_name?: string | null;
  action_code: string;
  target_type: string;
  target_id?: number | null;
  entity_label?: string;
  reference_label?: string;
  reference_no?: string;
  summary?: string;
  details?: string[];
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  created_at: string;
};

export type ActivityLogFilters = {
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  dateFrom?: string;
  dateTo?: string;
  actorUserId?: string;
  actionCode?: string;
  targetType?: string;
  targetId?: string;
  module?: string;
  referenceNo?: string;
};

export function useActivityLogList(params: () => ActivityLogFilters & { enabled?: boolean }) {
  return createQuery(() => {
    const p = params();
    const scoped = Boolean(p.targetType && p.targetId);
    const qs = new URLSearchParams({
      page: String(p.page),
      pageSize: String(p.pageSize),
      sort: p.sort,
      order: p.order,
    });
    if (p.dateFrom) qs.set("date_from", p.dateFrom);
    if (p.dateTo) qs.set("date_to", p.dateTo);
    if (p.actorUserId) qs.set("actor_user_id", p.actorUserId);
    if (p.actionCode) qs.set("action_code", p.actionCode);
    if (p.targetType) qs.set("target_type", p.targetType);
    if (p.targetId) qs.set("target_id", p.targetId);
    if (p.module) qs.set("module", p.module);
    if (p.referenceNo) qs.set("reference_no", p.referenceNo);

    const enabled = p.enabled !== false && (!scoped || Boolean(p.targetId));

    return {
      queryKey: [
        "activity-logs",
        p.page,
        p.pageSize,
        p.sort,
        p.order,
        p.dateFrom ?? "",
        p.dateTo ?? "",
        p.actorUserId ?? "",
        p.actionCode ?? "",
        p.targetType ?? "",
        p.targetId ?? "",
        p.module ?? "",
        p.referenceNo ?? "",
        enabled,
      ],
      enabled,
      queryFn: async () => {
        const res = await apiFetch<ActivityLogRow[]>(`/api/v1/activity-logs?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load activity logs");
        return {
          rows: res.data ?? [],
          total: res.meta?.total ?? 0,
          page: res.meta?.page ?? p.page,
          perPage: res.meta?.per_page ?? p.pageSize,
        };
      },
      gcTime: 300_000,
    };
  });
}
