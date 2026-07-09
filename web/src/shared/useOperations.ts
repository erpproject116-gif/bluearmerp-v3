import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type Workspace = {
  id: number;
  workspace_code: string;
  workspace_name: string;
  industry_pack?: string | null;
  inv_project_id?: number | null;
  job_cost_project_id?: number | null;
  inv_project_code?: string;
  job_cost_project_code?: string;
  status: string;
};

export type Column = {
  id: number;
  workspace_id: number;
  column_key: string;
  column_name: string;
  sort_order: number;
  column_color?: string | null;
};

export type WorkItem = {
  id: number;
  workspace_id: number;
  column_id: number;
  column_key?: string;
  column_name?: string;
  title: string;
  description?: string | null;
  status: "open" | "in_progress" | "done" | "blocked";
  priority: "low" | "normal" | "high" | "urgent";
  assignee_name?: string;
  partner_id?: number | null;
  partner_name?: string;
  start_date?: string | null;
  end_date?: string | null;
  blocked_by_item_id?: number | null;
  blocked_by_title?: string;
  quotation_id?: number | null;
  quotation_reference?: string;
};

export type AutomationRule = {
  id: number;
  workspace_id?: number | null;
  rule_name: string;
  trigger_event: string;
  trigger_config: Record<string, unknown>;
  action_type: string;
  action_config: Record<string, unknown>;
  is_active: boolean;
};

export type Dashboard = {
  id: number;
  workspace_id?: number | null;
  dashboard_name: string;
  is_default: boolean;
};

export type WidgetData = {
  widget_id: number;
  widget_type: string;
  title: string;
  data: unknown;
};

export type IndustryPack = {
  pack_code: string;
  pack_name: string;
};

export function useOperationsWorkspaces(params: () => { page: number; pageSize: number; q?: string }) {
  return createQuery(() => {
    const p = params();
    const qs = new URLSearchParams({ page: String(p.page), pageSize: String(p.pageSize) });
    if (p.q) qs.set("q", p.q);
    return {
      queryKey: ["operations-workspaces", p],
      queryFn: async () => {
        const res = await apiFetch<Workspace[]>(`/api/v1/operations/workspaces?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load workspaces");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 15_000,
    };
  });
}

export function useOperationsColumns(workspaceId: () => number | null) {
  return createQuery(() => {
    const id = workspaceId();
    return {
      queryKey: ["operations-columns", id],
      enabled: id != null && id > 0,
      queryFn: async () => {
        const res = await apiFetch<Column[]>(`/api/v1/operations/workspaces/${id}/columns`);
        if (!res.success) throw new Error(res.message ?? "Failed to load columns");
        return res.data ?? [];
      },
      staleTime: 15_000,
    };
  });
}

export function useOperationsWorkItems(params: () => {
  workspace_id?: number;
  board?: boolean;
  view?: "calendar" | "timeline";
  q?: string;
  page?: number;
  pageSize?: number;
}) {
  return createQuery(() => {
    const p = params();
    const qs = new URLSearchParams();
    if (p.workspace_id) qs.set("workspace_id", String(p.workspace_id));
    if (p.board) qs.set("board", "1");
    if (p.view) qs.set("view", p.view);
    if (p.q) qs.set("q", p.q);
    if (p.page) qs.set("page", String(p.page));
    if (p.pageSize) qs.set("pageSize", String(p.pageSize));
    return {
      queryKey: ["operations-work-items", p],
      queryFn: async () => {
        const res = await apiFetch<WorkItem[]>(`/api/v1/operations/work-items?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load work items");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 10_000,
    };
  });
}

export function useOperationsAutomationRules(workspaceId: () => number | null) {
  return createQuery(() => {
    const id = workspaceId();
    const qs = id ? `?workspace_id=${id}` : "";
    return {
      queryKey: ["operations-automation", id],
      queryFn: async () => {
        const res = await apiFetch<AutomationRule[]>(`/api/v1/operations/automation-rules${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load rules");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 15_000,
    };
  });
}

export function useOperationsDashboards(workspaceId: () => number | null) {
  return createQuery(() => {
    const id = workspaceId();
    const qs = id ? `?workspace_id=${id}` : "";
    return {
      queryKey: ["operations-dashboards", id],
      queryFn: async () => {
        const res = await apiFetch<Dashboard[]>(`/api/v1/operations/dashboards${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load dashboards");
        return res.data ?? [];
      },
      staleTime: 15_000,
    };
  });
}

export function useOperationsWidgetData(dashboardId: () => number | null) {
  return createQuery(() => {
    const id = dashboardId();
    return {
      queryKey: ["operations-widget-data", id],
      enabled: id != null && id > 0,
      queryFn: async () => {
        const res = await apiFetch<WidgetData[]>(`/api/v1/operations/dashboards/${id}/widget-data`);
        if (!res.success) throw new Error(res.message ?? "Failed to load widget data");
        return res.data ?? [];
      },
      staleTime: 15_000,
    };
  });
}

export function useIndustryPacks() {
  return createQuery(() => ({
    queryKey: ["operations-industry-packs"],
    queryFn: async () => {
      const res = await apiFetch<IndustryPack[]>("/api/v1/operations/industry-packs");
      if (!res.success) throw new Error(res.message ?? "Failed to load packs");
      return res.data ?? [];
    },
    staleTime: 60_000,
  }));
}

export function useInvalidateOperations() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["operations-workspaces"] });
    void qc.invalidateQueries({ queryKey: ["operations-columns"] });
    void qc.invalidateQueries({ queryKey: ["operations-work-items"] });
    void qc.invalidateQueries({ queryKey: ["operations-automation"] });
    void qc.invalidateQueries({ queryKey: ["operations-dashboards"] });
    void qc.invalidateQueries({ queryKey: ["operations-widget-data"] });
  };
}

export async function createWorkspace(body: {
  workspace_code: string;
  workspace_name: string;
  industry_pack?: string;
}) {
  return apiFetch<Workspace>("/api/v1/operations/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function createWorkItem(body: {
  workspace_id: number;
  column_id: number;
  title: string;
  description?: string;
  priority?: string;
  partner_id?: number;
  start_date?: string;
  end_date?: string;
  blocked_by_item_id?: number;
}) {
  return apiFetch<WorkItem>("/api/v1/operations/work-items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function patchWorkItem(id: number, body: Record<string, unknown>) {
  return apiFetch<WorkItem>(`/api/v1/operations/work-items/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function createQuotationFromWorkItem(id: number) {
  return apiFetch<{ quotation_id: number; reference_no: string; edit_url: string }>(
    `/api/v1/operations/work-items/${id}/create-quotation`,
    { method: "POST" },
  );
}

export async function createAutomationRule(body: {
  workspace_id?: number;
  rule_name: string;
  trigger_event: string;
  action_type: string;
  trigger_config?: Record<string, unknown>;
  action_config?: Record<string, unknown>;
}) {
  return apiFetch<AutomationRule>("/api/v1/operations/automation-rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function patchAutomationRule(id: number, body: Record<string, unknown>) {
  return apiFetch<AutomationRule>(`/api/v1/operations/automation-rules/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteAutomationRule(id: number) {
  return apiFetch(`/api/v1/operations/automation-rules/${id}`, { method: "DELETE" });
}
