import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type JobCostProjectStatus = "active" | "on_hold" | "completed" | "cancelled";

export type JobCostProject = {
  id: number;
  project_code: string;
  project_name: string;
  partner_id?: number | null;
  partner_name?: string;
  inv_project_id?: number | null;
  status: JobCostProjectStatus;
  start_date?: string | null;
  end_date?: string | null;
  notes?: string | null;
};

export type BudgetLine = {
  id: number;
  project_id: number;
  line_no: number;
  category: string;
  description: string;
  budget_amount: number;
};

export type Timesheet = {
  id: number;
  project_id: number;
  project_code?: string;
  project_name?: string;
  user_id?: number | null;
  worker_name: string;
  work_date: string;
  hours: number;
  hourly_rate: number;
  cost_amount: number;
  description?: string | null;
};

export type BudgetVsActual = {
  project_id: number;
  project_code: string;
  project_name: string;
  total_budget: number;
  total_actual: number;
  variance: number;
  budget_lines: BudgetLine[];
  timesheet_total: number;
  by_category: { category: string; budget: number; actual: number; variance: number }[];
};

export function useJobCostProjects(params: () => { page: number; pageSize: number; q?: string }) {
  return createQuery(() => {
    const p = params();
    const qs = new URLSearchParams({ page: String(p.page), pageSize: String(p.pageSize) });
    if (p.q) qs.set("q", p.q);
    return {
      queryKey: ["job-cost-projects", p],
      queryFn: async () => {
        const res = await apiFetch<JobCostProject[]>(`/api/v1/job-costing/projects?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load projects");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 15_000,
    };
  });
}

export function useBudgetLines(projectId: () => number | null) {
  return createQuery(() => {
    const id = projectId();
    return {
      queryKey: ["job-cost-budget", id],
      enabled: id != null && id > 0,
      queryFn: async () => {
        const res = await apiFetch<BudgetLine[]>(`/api/v1/job-costing/projects/${id}/budget-lines`);
        if (!res.success) throw new Error(res.message ?? "Failed to load budget");
        return res.data ?? [];
      },
      staleTime: 10_000,
    };
  });
}

export function useBudgetVsActual(projectId: () => number | null) {
  return createQuery(() => {
    const id = projectId();
    return {
      queryKey: ["job-cost-bva", id],
      enabled: id != null && id > 0,
      queryFn: async () => {
        const res = await apiFetch<BudgetVsActual>(`/api/v1/job-costing/projects/${id}/budget-vs-actual`);
        if (!res.success) throw new Error(res.message ?? "Failed to load budget vs actual");
        return res.data!;
      },
      staleTime: 10_000,
    };
  });
}

export function useJobCostTimesheets(params: () => { page: number; pageSize: number; project_id?: number }) {
  return createQuery(() => {
    const p = params();
    const qs = new URLSearchParams({ page: String(p.page), pageSize: String(p.pageSize) });
    if (p.project_id) qs.set("project_id", String(p.project_id));
    return {
      queryKey: ["job-cost-timesheets", p],
      queryFn: async () => {
        const res = await apiFetch<Timesheet[]>(`/api/v1/job-costing/timesheets?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load timesheets");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 15_000,
    };
  });
}

export function useInvalidateJobCosting() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["job-cost-projects"] });
    void qc.invalidateQueries({ queryKey: ["job-cost-budget"] });
    void qc.invalidateQueries({ queryKey: ["job-cost-bva"] });
    void qc.invalidateQueries({ queryKey: ["job-cost-timesheets"] });
  };
}

export async function createJobCostProject(body: Record<string, unknown>) {
  return apiFetch<JobCostProject>("/api/v1/job-costing/projects", { method: "POST", body: JSON.stringify(body) });
}

export async function patchJobCostProject(id: number, body: Record<string, unknown>) {
  return apiFetch<JobCostProject>(`/api/v1/job-costing/projects/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export async function createBudgetLine(projectId: number, body: Record<string, unknown>) {
  return apiFetch<BudgetLine>(`/api/v1/job-costing/projects/${projectId}/budget-lines`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function createTimesheet(body: Record<string, unknown>) {
  return apiFetch<Timesheet>("/api/v1/job-costing/timesheets", { method: "POST", body: JSON.stringify(body) });
}
