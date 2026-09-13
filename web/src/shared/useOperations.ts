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
  is_done?: boolean;
  wip_limit?: number | null;
  archived?: boolean;
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
  start_time?: string | null;
  end_time?: string | null;
  all_day?: boolean;
  reminder_offset_minutes?: number | null;
  reminder_at?: string | null;
  reminder_sent_at?: string | null;
  item_kind?: "task" | "meeting";
  all_hands?: boolean;
  meeting_place?: string | null;
  blocked_by_item_id?: number | null;
  blocked_by_title?: string;
  quotation_id?: number | null;
  quotation_reference?: string;
  custom_values?: Record<string, unknown>;
};

export type WorkItemLink = {
  id: number;
  work_item_id: number;
  link_type: string;
  doc_type: string;
  doc_id: number;
  label?: string;
  href?: string;
  created_at?: string;
};

export type DocSearchHit = {
  doc_type: string;
  doc_id: number;
  label: string;
  href?: string;
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
  id?: number;
  pack_code: string;
  pack_name: string;
  summary?: string;
  description?: string;
  is_system?: boolean;
  source_pack_code?: string;
  columns?: Array<{
    key: string;
    name: string;
    sort_order: number;
    color?: string;
    is_done?: boolean;
  }>;
  sample_work_items?: Array<{
    title: string;
    column_key: string;
    priority?: string;
    start_date_offset_days?: number;
    end_date_offset_days?: number;
  }>;
};

export const FALLBACK_INDUSTRY_PACKS: IndustryPack[] = [
  { pack_code: "general", pack_name: "General SME", summary: "3 Kanban columns, starter tasks, dashboard widgets" },
  { pack_code: "construction", pack_name: "Construction", summary: "Build-phase columns, starter tasks, dashboard widgets" },
  { pack_code: "professional_services", pack_name: "Professional Services", summary: "Delivery pipeline columns and starter tasks" },
  { pack_code: "warehouse", pack_name: "Warehouse / Logistics", summary: "Fulfillment workflow columns and starter tasks" },
  { pack_code: "job_shop", pack_name: "Engineering / Job Shop", summary: "Shop-floor columns and starter tasks" },
];

const OPS_STALE_MS = 60_000;

const OPS_QUERY_OPTS = {
  staleTime: OPS_STALE_MS,
  gcTime: 5 * OPS_STALE_MS,
  retry: false as const,
  refetchOnWindowFocus: false as const,
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
      staleTime: OPS_STALE_MS,
      gcTime: 5 * OPS_STALE_MS,
    };
  });
}

export async function fetchOperationsColumns(workspaceId: number): Promise<Column[]> {
  const res = await apiFetch<Column[]>(`/api/v1/operations/workspaces/${workspaceId}/columns`);
  if (!res.success) throw new Error(res.message ?? "Failed to load columns");
  return res.data ?? [];
}

export function useOperationsColumns(workspaceId: () => number | null) {
  return createQuery(() => {
    const id = workspaceId();
    return {
      queryKey: ["operations-columns", id],
      enabled: id != null && id > 0,
      queryFn: () => fetchOperationsColumns(id!),
      ...OPS_QUERY_OPTS,
      placeholderData: (prev: Column[] | undefined) => prev,
    };
  });
}

export type WorkItemsQueryParams = {
  workspace_id?: number;
  board?: boolean;
  view?: "calendar" | "timeline";
  q?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
  order?: "asc" | "desc";
  enabled?: boolean;
};

type WorkItemsResult = { rows: WorkItem[]; total: number };

export async function fetchOperationsBoardWorkItems(workspaceId: number, q?: string): Promise<WorkItemsResult> {
  const qs = new URLSearchParams({
    workspace_id: String(workspaceId),
    board: "1",
    page: "1",
    pageSize: "200",
  });
  if (q) qs.set("q", q);
  const res = await apiFetch<WorkItem[]>(`/api/v1/operations/work-items?${qs}`);
  if (!res.success) throw new Error(res.message ?? "Failed to load work items");
  return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
}

export function boardWorkItemsQueryKey(workspaceId: number, q?: string) {
  return ["operations-work-items", "board", workspaceId, q?.trim() || null] as const;
}

/** Shared board fetch for Hub, Calendar, and Timeline — one cache entry per workspace. */
export function useOperationsBoardWorkItems(
  workspaceId: () => number | null,
  opts?: () => { q?: string; enabled?: boolean },
) {
  return createQuery(() => {
    const id = workspaceId() ?? 0;
    const o = opts?.() ?? {};
    const q = o.q?.trim() || undefined;
    return {
      queryKey: boardWorkItemsQueryKey(id, q),
      enabled: o.enabled !== false && id > 0,
      queryFn: () => fetchOperationsBoardWorkItems(id, q),
      ...OPS_QUERY_OPTS,
      placeholderData: (prev: WorkItemsResult | undefined) => prev,
    };
  });
}

export function useOperationsWorkItems(params: () => WorkItemsQueryParams) {
  return createQuery(() => {
    const p = params();
    const wsId = p.workspace_id ?? 0;
    const qs = new URLSearchParams();
    if (wsId > 0) qs.set("workspace_id", String(wsId));
    if (p.board) qs.set("board", "1");
    if (p.view) qs.set("view", p.view);
    if (p.q) qs.set("q", p.q);
    if (p.page) qs.set("page", String(p.page));
    if (p.pageSize) qs.set("pageSize", String(p.pageSize));
    if (p.sort) qs.set("sort", p.sort);
    if (p.order) qs.set("order", p.order);
    return {
      queryKey: ["operations-work-items", p],
      enabled: p.enabled !== false && wsId > 0,
      queryFn: async () => {
        const res = await apiFetch<WorkItem[]>(`/api/v1/operations/work-items?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load work items");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: OPS_STALE_MS,
      placeholderData: (prev: WorkItemsResult | undefined) => prev,
    };
  });
}

export function useOperationsAutomationRules(params: () => {
  workspace_id?: number | null;
  page?: number;
  pageSize?: number;
}) {
  return createQuery(() => {
    const p = params();
    const qs = new URLSearchParams();
    if (p.workspace_id) qs.set("workspace_id", String(p.workspace_id));
    if (p.page) qs.set("page", String(p.page));
    if (p.pageSize) qs.set("pageSize", String(p.pageSize));
    const suffix = qs.toString() ? `?${qs}` : "";
    return {
      queryKey: ["operations-automation", p],
      queryFn: async () => {
        const res = await apiFetch<AutomationRule[]>(`/api/v1/operations/automation-rules${suffix}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load rules");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: OPS_STALE_MS,
      placeholderData: (prev: { rows: AutomationRule[]; total: number } | undefined) => prev,
    };
  });
}

export function useOperationsDashboards(workspaceId: () => number | null) {
  return createQuery(() => {
    const id = workspaceId();
    const qs = id ? `?workspace_id=${id}` : "";
    return {
      queryKey: ["operations-dashboards", id],
      enabled: id != null && id > 0,
      queryFn: async () => {
        const res = await apiFetch<Dashboard[]>(`/api/v1/operations/dashboards${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load dashboards");
        return res.data ?? [];
      },
      staleTime: OPS_STALE_MS,
      placeholderData: (prev: Dashboard[] | undefined) => prev,
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
      staleTime: OPS_STALE_MS,
      placeholderData: (prev: WidgetData[] | undefined) => prev,
    };
  });
}

export type TasksDashboardSummary = {
  my_open: number;
  my_overdue: number;
  workspace_overdue: number;
  due_this_week: number;
  by_status: { key: string; count: number }[];
  by_priority: { key: string; count: number }[];
  overdue_or_soon: {
    id: number;
    title: string;
    status: string;
    priority: string;
    end_date?: string | null;
    assignee_user_id?: number | null;
    assignee_name?: string;
    overdue: boolean;
  }[];
  crm_follow_ups_open: number;
  crm_follow_ups_deep_link: string;
};

export function useOperationsTasksDashboard(workspaceId: () => number | null) {
  return createQuery(() => {
    const id = workspaceId();
    return {
      queryKey: ["operations-tasks-summary", id],
      enabled: id != null && id > 0,
      queryFn: async () => {
        const res = await apiFetch<TasksDashboardSummary>(
          `/api/v1/operations/dashboards/tasks-summary?workspace_id=${id}`,
        );
        if (!res.success) throw new Error(res.message ?? "Failed to load tasks dashboard");
        return res.data!;
      },
      staleTime: OPS_STALE_MS,
    };
  });
}

export function useIndustryPacks() {
  return createQuery(() => ({
    queryKey: ["operations-industry-packs"],
    queryFn: async () => {
      const res = await apiFetch<IndustryPack[]>("/api/v1/operations/packs");
      if (!res.success) {
        const fallback = await apiFetch<IndustryPack[]>("/api/v1/operations/industry-packs");
        if (!fallback.success) throw new Error(res.message ?? "Failed to load packs");
        return fallback.data ?? [];
      }
      return res.data ?? [];
    },
    staleTime: 60_000,
  }));
}

export function useOperationsPackDetail(packId: () => number | null) {
  return createQuery(() => {
    const id = packId();
    return {
      queryKey: ["operations-pack", id],
      enabled: id != null && id > 0,
      queryFn: async () => {
        const res = await apiFetch<IndustryPack>(`/api/v1/operations/packs/${id}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load pack");
        return res.data!;
      },
      staleTime: OPS_STALE_MS,
    };
  });
}

export function useInvalidateWorkspaces() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ["operations-workspaces"] });
}

export function useInvalidateWorkItems() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ["operations-work-items"] });
}

export function useInvalidateAutomationRules() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ["operations-automation"] });
}

export function useInvalidateDashboards() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["operations-dashboards"] });
    void qc.invalidateQueries({ queryKey: ["operations-widget-data"] });
  };
}

export function useInvalidateColumns() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ["operations-columns"] });
}

export function useInvalidatePacks() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["operations-industry-packs"] });
    void qc.invalidateQueries({ queryKey: ["operations-pack"] });
  };
}

/** Broad invalidation — prefer targeted helpers when possible. */
export function useInvalidateOperations() {
  const invalidateWorkspaces = useInvalidateWorkspaces();
  const invalidateWorkItems = useInvalidateWorkItems();
  const invalidateAutomation = useInvalidateAutomationRules();
  const invalidateDashboards = useInvalidateDashboards();
  const invalidateColumns = useInvalidateColumns();
  const invalidatePacks = useInvalidatePacks();
  return () => {
    invalidateWorkspaces();
    invalidateColumns();
    invalidateWorkItems();
    invalidateAutomation();
    invalidateDashboards();
    invalidatePacks();
  };
}

export async function createWorkspace(body: {
  workspace_code: string;
  workspace_name: string;
  industry_pack?: string;
  pack_id?: number;
}) {
  return apiFetch<Workspace>("/api/v1/operations/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function patchWorkspace(id: number, body: { workspace_name?: string; status?: string }) {
  return apiFetch<Workspace>(`/api/v1/operations/workspaces/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function createColumn(workspaceId: number, body: {
  column_key: string;
  column_name: string;
  sort_order?: number;
  column_color?: string;
  is_done?: boolean;
  wip_limit?: number | null;
}) {
  return apiFetch<Column>(`/api/v1/operations/workspaces/${workspaceId}/columns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function patchColumn(workspaceId: number, columnId: number, body: Record<string, unknown>) {
  return apiFetch<Column>(`/api/v1/operations/workspaces/${workspaceId}/columns/${columnId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function reorderColumns(workspaceId: number, columns: Array<{ id: number; sort_order: number }>) {
  return apiFetch<Column[]>(`/api/v1/operations/workspaces/${workspaceId}/columns/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ columns }),
  });
}

export async function deleteColumn(workspaceId: number, columnId: number, force = false) {
  const qs = force ? "?force=1" : "";
  return apiFetch(`/api/v1/operations/workspaces/${workspaceId}/columns/${columnId}${qs}`, { method: "DELETE" });
}

export async function clonePack(packId: number, body?: { pack_code?: string; pack_name?: string }) {
  return apiFetch<IndustryPack>(`/api/v1/operations/packs/${packId}/clone`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

export async function createPack(body: {
  pack_code: string;
  pack_name: string;
  description?: string;
  columns: Array<{ key: string; name: string; sort_order: number; color?: string; is_done?: boolean }>;
}) {
  return apiFetch<IndustryPack>("/api/v1/operations/packs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function patchPack(packId: number, body: Record<string, unknown>) {
  return apiFetch<IndustryPack>(`/api/v1/operations/packs/${packId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deletePack(packId: number) {
  return apiFetch(`/api/v1/operations/packs/${packId}`, { method: "DELETE" });
}

export async function saveWorkspaceAsPack(workspaceId: number, body: {
  pack_code: string;
  pack_name: string;
  description?: string;
}) {
  return apiFetch<IndustryPack>(`/api/v1/operations/workspaces/${workspaceId}/save-as-pack`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function applyPackToWorkspace(workspaceId: number, body: {
  pack_id: number;
  mode?: "add_missing_columns" | "replace_empty_only";
}) {
  return apiFetch(`/api/v1/operations/workspaces/${workspaceId}/apply-pack`, {
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
  start_time?: string;
  end_time?: string;
  all_day?: boolean;
  reminder_offset_minutes?: number | null;
  blocked_by_item_id?: number;
  custom_values?: Record<string, unknown>;
}) {
  return apiFetch<WorkItem>("/api/v1/operations/work-items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function createAllHandsMeeting(body: {
  workspace_id: number;
  column_id: number;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  place: string;
  note?: string;
}) {
  return apiFetch<WorkItem>("/api/v1/operations/meetings", {
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

export async function listWorkItemLinks(workItemId: number) {
  return apiFetch<WorkItemLink[]>(`/api/v1/operations/work-items/${workItemId}/links`);
}

export async function createWorkItemLink(
  workItemId: number,
  body: { doc_type: string; doc_id: number; link_type?: string },
) {
  return apiFetch<WorkItemLink>(`/api/v1/operations/work-items/${workItemId}/links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteWorkItemLink(workItemId: number, linkId: number) {
  return apiFetch(`/api/v1/operations/work-items/${workItemId}/links/${linkId}`, {
    method: "DELETE",
  });
}

export async function searchERPDocs(docType: string, q: string) {
  const params = new URLSearchParams({ doc_type: docType });
  if (q.trim()) params.set("q", q.trim());
  return apiFetch<DocSearchHit[]>(`/api/v1/operations/doc-search?${params}`);
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
