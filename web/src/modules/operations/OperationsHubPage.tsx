import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { A, useNavigate, useSearchParams } from "@solidjs/router";
import { KanbanBoard } from "../../shared/KanbanBoard";
import { KanbanCard, type KanbanDetailRow } from "../../shared/KanbanCard";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import { loadViewMode, ViewModeToggle, type ViewMode } from "../../shared/ViewModeToggle";
import { useListState } from "../../shared/useListState";
import { useToast } from "../../shared/toast";
import { hasPermission, useAuth } from "../../shared/auth-context";
import {
  createQuotationFromWorkItem,
  createWorkItem,
  createWorkspace,
  patchWorkItem,
  useIndustryPacks,
  useInvalidateOperations,
  useOperationsColumns,
  useOperationsWorkItems,
  useOperationsWorkspaces,
  type WorkItem,
  type Workspace,
} from "../../shared/useOperations";
import { OperationsLayout } from "./OperationsLayout";

const STORAGE_KEY = "operations-hub-view";

const SAMPLE_PRESETS = [
  { code: "riverside-reno", name: "Riverside Office Renovation", pack: "construction" },
  { code: "acme-erp-rollout", name: "Acme Corp ERP Rollout", pack: "professional_services" },
  { code: "metro-hub-w12", name: "Metro Hub — Week 12 Ops", pack: "warehouse" },
  { code: "wo-4412-rail", name: "WO-4412 Guard Rail Job", pack: "job_shop" },
  { code: "sme-ops", name: "SME Weekly Operations", pack: "general" },
] as const;

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

function itemDetails(item: WorkItem): KanbanDetailRow[] {
  const rows: KanbanDetailRow[] = [];
  if (item.start_date) rows.push({ label: "Start", value: item.start_date });
  if (item.end_date) rows.push({ label: "End", value: item.end_date });
  if (item.partner_name) rows.push({ label: "Customer", value: item.partner_name });
  if (item.blocked_by_title) rows.push({ label: "Blocked by", value: item.blocked_by_title });
  if (item.quotation_reference) rows.push({ label: "Quote", value: item.quotation_reference });
  return rows;
}

export default function OperationsHubPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const invalidate = useInvalidateOperations();
  const canCreateWorkspace = () => hasPermission(auth.me, "operations.workspaces_new", "write");
  const canCreateItem = () => hasPermission(auth.me, "operations.work_items_new", "write");
  const canCreateQuote = () => hasPermission(auth.me, "operations.create_quotation", "write");

  const [viewMode, setViewMode] = createSignal<ViewMode>(loadViewMode(STORAGE_KEY));
  const [activeWorkspaceId, setActiveWorkspaceId] = createSignal<number | null>(null);
  const [workspaceModalOpen, setWorkspaceModalOpen] = createSignal(false);
  const [itemModalOpen, setItemModalOpen] = createSignal(false);
  const [wsCode, setWsCode] = createSignal("");
  const [wsName, setWsName] = createSignal("");
  const [wsPack, setWsPack] = createSignal("general");
  const [itemTitle, setItemTitle] = createSignal("");
  const [itemColumnId, setItemColumnId] = createSignal<number | null>(null);
  const [itemStartDate, setItemStartDate] = createSignal("");
  const [itemEndDate, setItemEndDate] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  const { page, setPage, q, setQ, sort, order, toggleSort, pageSize } = useListState("title");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);

  const workspaces = useOperationsWorkspaces(() => ({ page: 1, pageSize: 50 }));
  const packs = useIndustryPacks();
  const columns = useOperationsColumns(activeWorkspaceId);

  createEffect(() => {
    const code = typeof searchParams.ws === "string" ? searchParams.ws.trim() : "";
    if (!code || activeWorkspaceId()) return;
    const match = workspaces.data?.rows.find((w) => w.workspace_code === code);
    if (match) setActiveWorkspaceId(match.id);
  });

  const items = useOperationsWorkItems(() => ({
    workspace_id: activeWorkspaceId() ?? undefined,
    board: viewMode() === "board",
    q: q() || undefined,
    page: viewMode() === "board" ? 1 : page(),
    pageSize: viewMode() === "board" ? 500 : pageSize,
  }));

  const activeWorkspace = createMemo(() =>
    workspaces.data?.rows.find((w) => w.id === activeWorkspaceId()) ?? null,
  );

  const boardColumns = createMemo(() =>
    (columns.data ?? []).map((col) => ({
      id: String(col.id),
      label: col.column_name,
      items: (items.data?.rows ?? []).filter((i) => i.column_id === col.id),
    })),
  );

  const selectWorkspace = (ws: Workspace) => {
    setActiveWorkspaceId(ws.id);
    setPage(1);
  };

  const onDrop = async (item: WorkItem, _from: string, toColumnId: string) => {
    const colId = Number(toColumnId);
    if (!Number.isFinite(colId)) return;
    const res = await patchWorkItem(item.id, { column_id: colId });
    if (!res.success) {
      toast.warning(res.message ?? "Could not move item.");
      return;
    }
    invalidate();
  };

  const saveWorkspace = async () => {
    if (!wsCode().trim() || !wsName().trim()) {
      toast.warning("Workspace code and name are required.");
      return;
    }
    setSaving(true);
    const res = await createWorkspace({
      workspace_code: wsCode().trim(),
      workspace_name: wsName().trim(),
      industry_pack: wsPack() || undefined,
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not create workspace.");
      return;
    }
    setWorkspaceModalOpen(false);
    invalidate();
    if (res.data?.id) setActiveWorkspaceId(res.data.id);
    toast.success("Workspace created.");
  };

  const loadSampleWorkspace = async (preset: (typeof SAMPLE_PRESETS)[number]) => {
    setSaving(true);
    let code: string = preset.code;
    let res = await createWorkspace({
      workspace_code: code,
      workspace_name: preset.name,
      industry_pack: preset.pack,
    });
    if (!res.success) {
      code = `${preset.code}-${Date.now().toString(36).slice(-4)}`;
      res = await createWorkspace({
        workspace_code: code,
        workspace_name: preset.name,
        industry_pack: preset.pack,
      });
    }
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not load sample workspace.");
      return;
    }
    invalidate();
    if (res.data?.id) {
      setActiveWorkspaceId(res.data.id);
      setViewMode("board");
    }
    toast.success(`Sample project loaded: ${preset.name}`);
  };

  const openNewItem = () => {
    const firstCol = columns.data?.[0];
    setItemTitle("");
    setItemColumnId(firstCol?.id ?? null);
    setItemStartDate("");
    setItemEndDate("");
    setItemModalOpen(true);
  };

  const saveItem = async () => {
    const wsId = activeWorkspaceId();
    const colId = itemColumnId();
    if (!wsId || !colId || !itemTitle().trim()) {
      toast.warning("Workspace, column, and title are required.");
      return;
    }
    setSaving(true);
    const res = await createWorkItem({
      workspace_id: wsId,
      column_id: colId,
      title: itemTitle().trim(),
      start_date: itemStartDate() || undefined,
      end_date: itemEndDate() || undefined,
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not create work item.");
      return;
    }
    setItemModalOpen(false);
    invalidate();
    toast.success("Work item created.");
  };

  const handleCreateQuotation = async (item: WorkItem) => {
    const res = await createQuotationFromWorkItem(item.id);
    if (!res.success) {
      toast.warning(res.message ?? "Could not create quotation.");
      return;
    }
    invalidate();
    toast.success(`Quotation ${res.data?.reference_no ?? ""} created.`);
    if (res.data?.edit_url) navigate(res.data.edit_url);
  };

  return (
    <OperationsLayout>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <label class="text-sm text-text-secondary">Workspace</label>
          <select
            class={inputClass}
            value={activeWorkspaceId() ?? ""}
            onChange={(e) => {
              const id = Number(e.currentTarget.value);
              setActiveWorkspaceId(Number.isFinite(id) && id > 0 ? id : null);
            }}
          >
            <option value="">Select workspace…</option>
            <For each={workspaces.data?.rows ?? []}>
              {(ws) => <option value={ws.id}>{ws.workspace_name}</option>}
            </For>
          </select>
          <Show when={activeWorkspace()}>
            {(ws) => (
              <span class="text-xs text-text-secondary">
                Inv: {ws().inv_project_code || "—"} · Job cost: {ws().job_cost_project_code || "—"}
                {ws().industry_pack ? ` · ${ws().industry_pack}` : ""}
              </span>
            )}
          </Show>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <ViewModeToggle value={viewMode()} onChange={setViewMode} storageKey={STORAGE_KEY} />
          <Show when={canCreateWorkspace()}>
            <button
              type="button"
              class="rounded-lg border border-stroke px-3 py-2 text-sm font-medium text-text-primary hover:bg-slate-50"
              onClick={() => setWorkspaceModalOpen(true)}
            >
              + Workspace
            </button>
          </Show>
          <Show when={canCreateItem() && activeWorkspaceId()}>
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              onClick={openNewItem}
            >
              + Work item
            </button>
          </Show>
        </div>
      </div>

      <Show when={!activeWorkspaceId()} fallback={null}>
        <div class="rounded-xl border border-dashed border-stroke bg-slate-50 p-8 text-center text-sm text-text-secondary">
          <p>Select a workspace below, create your own, or load a sample project with realistic tasks.</p>
          <Show when={canCreateWorkspace()}>
            <div class="mt-4">
              <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Load sample data (industry pack)
              </p>
              <div class="flex flex-wrap justify-center gap-2">
                <For each={SAMPLE_PRESETS}>
                  {(preset) => (
                    <button
                      type="button"
                      class="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                      disabled={saving()}
                      onClick={() => void loadSampleWorkspace(preset)}
                    >
                      {preset.name}
                    </button>
                  )}
                </For>
              </div>
              <p class="mt-2 text-xs">
                Each sample creates a workspace with Kanban columns, dated work items, and a dashboard.
              </p>
            </div>
          </Show>
          <Show when={workspaces.data?.rows.length}>
            <div class="mt-6 flex flex-wrap justify-center gap-2">
              <For each={workspaces.data?.rows ?? []}>
                {(ws) => (
                  <button
                    type="button"
                    class="rounded-lg border border-stroke bg-white px-3 py-1.5 text-sm hover:bg-brand-50"
                    onClick={() => selectWorkspace(ws)}
                  >
                    {ws.workspace_name}
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>

      <Show when={activeWorkspaceId()}>
        <Show when={viewMode() === "table"}>
          <SpreadsheetGrid
            columns={[
              { key: "title", header: "Title", clickable: true },
              { key: "column_name", header: "Column" },
              { key: "status", header: "Status" },
              { key: "priority", header: "Priority", render: (r) => PRIORITY_LABELS[r.priority] ?? r.priority },
              { key: "start_date", header: "Start", render: (r) => r.start_date ?? "—" },
              { key: "end_date", header: "End", render: (r) => r.end_date ?? "—" },
              { key: "blocked_by_title", header: "Blocked by", render: (r) => r.blocked_by_title || "—" },
              { key: "partner_name", header: "Customer", render: (r) => r.partner_name ?? "—" },
              {
                key: "quotation_reference",
                header: "Quotation",
                render: (r) =>
                  r.quotation_reference ? (
                    <A href={`/app/quotation/quotations/${r.quotation_id}`} class="text-brand-600 hover:underline">
                      {r.quotation_reference}
                    </A>
                  ) : (
                    "—"
                  ),
              },
              {
                key: "actions",
                header: "Actions",
                render: (r) => (
                  <Show when={canCreateQuote() && !r.quotation_id && r.partner_id}>
                    <button
                      type="button"
                      class="text-xs font-medium text-brand-600 hover:underline"
                      onClick={() => void handleCreateQuotation(r)}
                    >
                      Create quotation
                    </button>
                  </Show>
                ),
              },
            ]}
            rows={items.data?.rows ?? []}
            loading={items.isFetching}
            selectedId={selectedId()}
            onSelect={setSelectedId}
            onEdit={(row) => setSelectedId(row.id)}
            onNew={openNewItem}
            showNew={canCreateItem()}
            codeKey="title"
            nameKey="title"
            sortKey={sort()}
            sortOrder={order()}
            onSort={toggleSort}
            page={page()}
            pageSize={pageSize}
            total={items.data?.total ?? 0}
            onPageChange={setPage}
            search={q()}
            onSearchChange={setQ}
            searchPlaceholder="Search work items…"
          />
        </Show>

        <Show when={viewMode() === "board"}>
          <KanbanBoard
            columns={boardColumns()}
            getCardId={(i) => i.id}
            onDrop={(item, from, to) => void onDrop(item, from, to)}
            loading={items.isFetching || columns.isFetching}
            renderCard={(item) => (
              <KanbanCard
                title={item.title}
                subtitle={PRIORITY_LABELS[item.priority] ?? item.priority}
                badge={item.column_name}
                details={itemDetails(item)}
                onClick={() => setSelectedId(item.id)}
              />
            )}
          />
        </Show>
      </Show>

      <EntityModal
        open={workspaceModalOpen()}
        title="New workspace"
        onClose={() => setWorkspaceModalOpen(false)}
        onSave={() => void saveWorkspace()}
        saving={saving()}
      >
        <Field label="Code">
          <input class={inputClass} value={wsCode()} onInput={(e) => setWsCode(e.currentTarget.value)} />
        </Field>
        <Field label="Name">
          <input class={inputClass} value={wsName()} onInput={(e) => setWsName(e.currentTarget.value)} />
        </Field>
        <Field label="Industry pack">
          <select class={inputClass} value={wsPack()} onChange={(e) => setWsPack(e.currentTarget.value)}>
            <option value="">None (default columns)</option>
            <For each={packs.data ?? []}>
              {(p) => <option value={p.pack_code}>{p.pack_name}</option>}
            </For>
          </select>
        </Field>
        <p class="text-xs text-text-secondary">
          Creating a workspace also provisions linked inventory and job-cost projects.
        </p>
      </EntityModal>

      <EntityModal
        open={itemModalOpen()}
        title="New work item"
        onClose={() => setItemModalOpen(false)}
        onSave={() => void saveItem()}
        saving={saving()}
      >
        <Field label="Title">
          <input class={inputClass} value={itemTitle()} onInput={(e) => setItemTitle(e.currentTarget.value)} />
        </Field>
        <Field label="Column">
          <select
            class={inputClass}
            value={itemColumnId() ?? ""}
            onChange={(e) => setItemColumnId(Number(e.currentTarget.value) || null)}
          >
            <For each={columns.data ?? []}>
              {(col) => <option value={col.id}>{col.column_name}</option>}
            </For>
          </select>
        </Field>
        <Field label="Start date">
          <input type="date" class={inputClass} value={itemStartDate()} onInput={(e) => setItemStartDate(e.currentTarget.value)} />
        </Field>
        <Field label="End date">
          <input type="date" class={inputClass} value={itemEndDate()} onInput={(e) => setItemEndDate(e.currentTarget.value)} />
        </Field>
      </EntityModal>
    </OperationsLayout>
  );
}
