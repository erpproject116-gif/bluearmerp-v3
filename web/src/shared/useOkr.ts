import { createMutation, createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type OkrObjective = {
  id: number;
  title: string;
  owner_user_id?: number | null;
  owner_name?: string;
  period_start: string;
  period_end: string;
  status: string;
  progress: number;
  at_risk: boolean;
  created_at: string;
  updated_at: string;
};

export type OkrKeyResult = {
  id: number;
  objective_id: number;
  title: string;
  metric_unit: string;
  target_value: number;
  current_value: number;
  sort_order: number;
  progress: number;
};

export type OkrDashboard = {
  active_count: number;
  avg_progress: number;
  at_risk_count: number;
  by_owner: { owner_name: string; progress: number; count: number }[];
  objectives: OkrObjective[];
};

export function useOkrObjectives(params: () => { page: number; pageSize: number; status?: string }) {
  return createQuery(() => {
    const p = params();
    const qs = new URLSearchParams({ page: String(p.page), pageSize: String(p.pageSize) });
    if (p.status) qs.set("status", p.status);
    return {
      queryKey: ["okr-objectives", p.page, p.pageSize, p.status ?? ""],
      queryFn: async () => {
        const res = await apiFetch<OkrObjective[]>(`/api/v1/okr/objectives?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load OKRs");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 30_000,
    };
  });
}

export function useOkrKeyResults(objectiveId: () => number | null) {
  return createQuery(() => {
    const id = objectiveId();
    return {
      queryKey: ["okr-key-results", id],
      enabled: id != null && id > 0,
      queryFn: async () => {
        const res = await apiFetch<OkrKeyResult[]>(`/api/v1/okr/objectives/${id}/key-results`);
        if (!res.success) throw new Error(res.message ?? "Failed to load key results");
        return res.data ?? [];
      },
    };
  });
}

export function useOkrDashboard() {
  return createQuery(() => ({
    queryKey: ["okr-dashboard"],
    queryFn: async () => {
      const res = await apiFetch<OkrDashboard>("/api/v1/okr/dashboard/summary");
      if (!res.success) throw new Error(res.message ?? "Failed to load OKR dashboard");
      return res.data!;
    },
    staleTime: 30_000,
  }));
}

export function useOkrMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["okr-objectives"] });
    void qc.invalidateQueries({ queryKey: ["okr-key-results"] });
    void qc.invalidateQueries({ queryKey: ["okr-dashboard"] });
  };
  return {
    createObjective: createMutation(() => ({
      mutationFn: async (body: {
        title: string;
        period_start: string;
        period_end: string;
      }) => {
        const res = await apiFetch<OkrObjective>("/api/v1/okr/objectives", {
          method: "POST",
          body: JSON.stringify(body),
        });
        if (!res.success) throw new Error(res.message ?? "Create failed");
        return res.data!;
      },
      onSuccess: invalidate,
    })),
    createKeyResult: createMutation(() => ({
      mutationFn: async (args: {
        objectiveId: number;
        title: string;
        metric_unit?: string;
        target_value?: number;
        current_value?: number;
      }) => {
        const res = await apiFetch<OkrKeyResult>(`/api/v1/okr/objectives/${args.objectiveId}/key-results`, {
          method: "POST",
          body: JSON.stringify({
            title: args.title,
            metric_unit: args.metric_unit ?? "percent",
            target_value: args.target_value ?? 100,
            current_value: args.current_value ?? 0,
          }),
        });
        if (!res.success) throw new Error(res.message ?? "Create KR failed");
        return res.data!;
      },
      onSuccess: invalidate,
    })),
    patchKeyResult: createMutation(() => ({
      mutationFn: async (args: { id: number; current_value: number }) => {
        const res = await apiFetch<OkrKeyResult>(`/api/v1/okr/key-results/${args.id}`, {
          method: "PATCH",
          body: JSON.stringify({ current_value: args.current_value }),
        });
        if (!res.success) throw new Error(res.message ?? "Update failed");
        return res.data!;
      },
      onSuccess: invalidate,
    })),
  };
}
