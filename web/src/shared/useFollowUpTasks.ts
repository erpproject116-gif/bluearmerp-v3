import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type FollowUpTaskStage = "scheduled" | "due_soon" | "overdue" | "completed" | "cancelled";
export type FollowUpTaskType = "warranty_follow_up" | "quote_follow_up" | "manual";

export type FollowUpTask = {
  id: number;
  task_type: FollowUpTaskType;
  stage: FollowUpTaskStage;
  due_date: string;
  partner_id?: number | null;
  partner_name?: string;
  pic_user_id?: number | null;
  pic_name: string;
  warranty_asset_id?: number | null;
  warranty_serial?: string;
  quotation_id?: number | null;
  quotation_reference?: string;
  sales_id?: number | null;
  sales_no?: string;
  title: string;
  notes?: string | null;
  completed_at?: string | null;
  created_at?: string;
};

export type FollowUpTaskListParams = {
  page: number;
  pageSize: number;
  stage?: string;
  taskType?: string;
  q?: string;
  board?: boolean;
};

export function useFollowUpTasks(params: () => FollowUpTaskListParams) {
  return createQuery(() => {
    const p = params();
    const qs = new URLSearchParams({
      page: String(p.page),
      pageSize: String(p.pageSize),
    });
    if (p.stage) qs.set("stage", p.stage);
    if (p.taskType) qs.set("task_type", p.taskType);
    if (p.q) qs.set("q", p.q);
    if (p.board) qs.set("board", "true");
    return {
      queryKey: ["crm-follow-up-tasks", p],
      queryFn: async () => {
        const res = await apiFetch<FollowUpTask[]>(`/api/v1/crm/follow-up-tasks?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load follow-up tasks");
        return {
          rows: res.data ?? [],
          total: res.meta?.total ?? 0,
        };
      },
      staleTime: 15_000,
    };
  });
}

export async function createFollowUpTask(payload: {
  task_type?: FollowUpTaskType;
  due_date: string;
  partner_id?: number | null;
  pic_user_id?: number | null;
  pic_name?: string;
  title: string;
  notes?: string;
  warranty_asset_id?: number | null;
  quotation_id?: number | null;
  sales_id?: number | null;
}) {
  return apiFetch<FollowUpTask>("/api/v1/crm/follow-up-tasks", {
    method: "POST",
    body: JSON.stringify(payload),
  }, { successMessage: "CRM task created." });
}

export async function patchFollowUpTask(
  id: number,
  payload: Partial<{ stage: FollowUpTaskStage; due_date: string; notes: string; title: string }>,
) {
  return apiFetch(`/api/v1/crm/follow-up-tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function patchFollowUpTaskStage(id: number, stage: FollowUpTaskStage) {
  return apiFetch(`/api/v1/crm/follow-up-tasks/${id}/stage`, {
    method: "PATCH",
    body: JSON.stringify({ stage }),
  }, { successMessage: "Task updated." });
}

export function useInvalidateFollowUpTasks() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["crm-follow-up-tasks"] });
}
