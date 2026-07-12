import { useQueryClient } from "@tanstack/solid-query";
import { createMemo, createSignal, For, Show } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { KanbanBoard } from "../../shared/KanbanBoard";
import { KanbanCard, type KanbanDetailRow } from "../../shared/KanbanCard";
import { CustomFieldsSection, validateCustomFields } from "../../shared/CustomFieldsSection";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import { loadViewMode, ViewModeToggle, type ViewMode } from "../../shared/ViewModeToggle";
import { useCustomValues } from "../../shared/useCustomValues";
import { useDebouncedSignal } from "../../shared/useDebouncedSignal";
import { useFormFieldSettings } from "../../shared/useFormFieldSettings";
import { useListState } from "../../shared/useListState";
import { useToast } from "../../shared/toast";
import { hasPermission, useAuth } from "../../shared/auth-context";
import { OPERATIONS_ENTITY, OPERATIONS_SETTINGS_HREF } from "../../shared/entityTypes";
import {
  createQuotationFromWorkItem,
  createWorkItem,
  createWorkspace,
  patchWorkItem,
  boardWorkItemsQueryKey,
  FALLBACK_INDUSTRY_PACKS,
  useIndustryPacks,
  useInvalidateColumns,
  useInvalidateWorkItems,
  useInvalidateWorkspaces,
  useOperationsBoardWorkItems,
  useOperationsColumns,
  useOperationsWorkspaces,
  type WorkItem,
  type Workspace,
} from "../../shared/useOperations";
import { OperationsLayout } from "./OperationsLayout";
import { OperationsBoardSettingsModal } from "./OperationsBoardSettingsModal";
import { OperationsWorkspaceSelector, useOperationsWorkspace } from "./operationsWorkspace";
import { WorkItemLinksPanel } from "./WorkItemLinksPanel";

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

function compareRows(a: WorkItem, b: WorkItem, key: string, ord: "asc" | "desc"): number {
  const dir = ord === "asc" ? 1 : -1;
  const av = (a as Record<string, unknown>)[key];
  const bv = (b as Record<string, unknown>)[key];
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir;
}

export default function OperationsHubPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const invalidateWorkspaces = useInvalidateWorkspaces();
  const invalidateWorkItems = useInvalidateWorkItems();
  const invalidateColumns = useInvalidateColumns();
  const { workspaceId, setWorkspaceId } = useOperationsWorkspace();
  const canCreateWorkspace = () => hasPermission(auth.me, "operations.workspaces_new", "write");
  const canCreateItem = () => hasPermission(auth.me, "operations.work_items_new", "write");
  const canCreateQuote = () => hasPermission(auth.me, "operations.create_quotation", "write");
  const canEditItem = () => hasPermission(auth.me, "operations.work_items", "write");
  const canConfigBoard = () =>
    hasPermission(auth.me, "operations.board_config", "write") ||
    hasPermission(auth.me, "operations.workspaces", "write");

  const [viewMode, setViewMode] = createSignal<ViewMode>(loadViewMode(STORAGE_KEY));
  const [workspaceModalOpen, setWorkspaceModalOpen] = createSignal(false);
  const [boardSettingsOpen, setBoardSettingsOpen] = createSignal(false);
  const [itemModalOpen, setItemModalOpen] = createSignal(false);
  const [editItem, setEditItem] = createSignal<WorkItem | null>(null);
  const [wsCode, setWsCode] = createSignal("");
  const [wsName, setWsName] = createSignal("");
  const [wsPack, setWsPack] = createSignal("general");
  const [itemTitle, setItemTitle] = createSignal("");
  const [itemColumnId, setItemColumnId] = createSignal<number | null>(null);
  const [itemStartDate, setItemStartDate] = createSignal("");
  const [itemEndDate, setItemEndDate] = createSignal("");
  const [editTitle, setEditTitle] = createSignal("");
  const [editColumnId, setEditColumnId] = createSignal<number | null>(null);
  const [editPriority, setEditPriority] = createSignal("normal");
  const [editStatus, setEditStatus] = createSignal("open");
  const [editStartDate, setEditStartDate] = createSignal("");
  const [editEndDate, setEditEndDate] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const { customValues, setCustom, loadCustom } = useCustomValues();
  const { activeCustomFields } = useFormFieldSettings(OPERATIONS_ENTITY.workItem);

  const { page, setPage, q, setQ, sort, order, toggleSort, pageSize } = useListState("title");
  const debouncedQ = useDebouncedSignal(q);
  const [selectedId, setSelectedId] = createSignal<number | null>(null);

  const workspaces = useOperationsWorkspaces(() => ({ page: 1, pageSize: 100 }));
  const packs = useIndustryPacks();
  const packOptions = createMemo(() => {
    const loaded = packs.data;
    if (loaded && loaded.length > 0) return loaded;
    return FALLBACK_INDUSTRY_PACKS;
  });
  const selectedPack = createMemo(() => packOptions().find((p) => p.pack_code === wsPack()) ?? null);
  const activeWorkspaceId = workspaceId;
  const columns = useOperationsColumns(activeWorkspaceId);

  const activeWorkspace = createMemo(() =>
    workspaces.data?.rows.find((w) => w.id === activeWorkspaceId()) ?? null,
  );

  const hasValidWorkspace = createMemo(() => activeWorkspace() != null);

  const boardQ = createMemo(() => debouncedQ().trim() || undefined);
  const items = useOperationsBoardWorkItems(activeWorkspaceId, () => ({
    q: boardQ(),
    enabled: hasValidWorkspace(),
  }));

  const tableRows = createMemo(() => {
    const rows = [...(items.data?.rows ?? [])];
    rows.sort((a, b) => compareRows(a, b, sort(), order()));
    const start = (page() - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  });

  const tableTotal = createMemo(() => items.data?.rows.length ?? 0);

  const boardColumns = createMemo(() => {
    const cols = columns.data ?? [];
    const rows = items.data?.rows ?? [];
    const byColumn = new Map<number, WorkItem[]>();
    for (const item of rows) {
      const list = byColumn.get(item.column_id) ?? [];
      list.push(item);
      byColumn.set(item.column_id, list);
    }
    return cols.map((col) => ({
      id: String(col.id),
      label: col.column_name,
      items: byColumn.get(col.id) ?? [],
    }));
  });

  const selectWorkspace = (ws: Workspace) => {
    setWorkspaceId(ws.id);
    setPage(1);
  };

  const openEditItem = (item: WorkItem) => {
    setEditItem(item);
    setEditTitle(item.title);
    setEditColumnId(item.column_id);
    setEditPriority(item.priority);
    setEditStatus(item.status);
    setEditStartDate(item.start_date ?? "");
    setEditEndDate(item.end_date ?? "");
    loadCustom(item.custom_values ?? {});
    setSelectedId(item.id);
  };

  const onDrop = async (item: WorkItem, _from: string, toColumnId: string) => {
    const colId = Number(toColumnId);
    if (!Number.isFinite(colId) || colId === item.column_id) return;
    const col = columns.data?.find((c) => c.id === colId);
    const queryKey = boardWorkItemsQueryKey(activeWorkspaceId()!, boardQ());
    type WorkItemsCache = { rows: WorkItem[]; total: number };
    const previous = qc.getQueryData<WorkItemsCache>(queryKey);
    qc.setQueryData<WorkItemsCache>(queryKey, (old) => {
      if (!old) return old;
      return {
        ...old,
        rows: old.rows.map((row: WorkItem) =>
          row.id === item.id
            ? { ...row, column_id: colId, column_name: col?.column_name ?? row.column_name }
            : row,
        ),
      };
    });
    const res = await patchWorkItem(item.id, { column_id: colId });
    if (!res.success) {
      if (previous) qc.setQueryData(queryKey, previous);
      toast.warning(res.message ?? "Could not move item.");
      return;
    }
    void qc.invalidateQueries({ queryKey: ["operations-work-items"] });
  };

  const saveWorkspace = async () => {
    if (!wsCode().trim() || !wsName().trim()) {
      toast.warning("Workspace code and name are required.");
      return;
    }
    setSaving(true);
    const pack = selectedPack();
    const res = await createWorkspace({
      workspace_code: wsCode().trim(),
      workspace_name: wsName().trim(),
      industry_pack: pack?.pack_code || wsPack() || undefined,
      pack_id: pack?.id,
    });
    setSaving(false);
    if (!res.success) {
      const detail = res.errors ? Object.values(res.errors).filter(Boolean).join(" ") : "";
      toast.warning(detail || res.message || "Could not create workspace.");
      return;
    }
    setWorkspaceModalOpen(false);
    invalidateWorkspaces();
    if (res.data?.id) setWorkspaceId(res.data.id);
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
    invalidateWorkspaces();
    if (res.data?.id) {
      setWorkspaceId(res.data.id);
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
    loadCustom({});
    setItemModalOpen(true);
  };

  const saveItem = async () => {
    const wsId = activeWorkspaceId();
    const colId = itemColumnId();
    if (!wsId || !colId || !itemTitle().trim()) {
      toast.warning("Workspace, column, and title are required.");
      return;
    }
    const cfError = validateCustomFields(customValues(), activeCustomFields());
    if (cfError) {
      toast.warning(cfError);
      return;
    }
    setSaving(true);
    const res = await createWorkItem({
      workspace_id: wsId,
      column_id: colId,
      title: itemTitle().trim(),
      start_date: itemStartDate() || undefined,
      end_date: itemEndDate() || undefined,
      custom_values: customValues(),
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not create work item.");
      return;
    }
    setItemModalOpen(false);
    invalidateWorkItems();
    toast.success("Work item created.");
  };

  const saveEditItem = async () => {
    const item = editItem();
    const colId = editColumnId();
    if (!item || !colId || !editTitle().trim()) {
      toast.warning("Title and column are required.");
      return;
    }
    const cfError = validateCustomFields(customValues(), activeCustomFields());
    if (cfError) {
      toast.warning(cfError);
      return;
    }
    setSaving(true);
    const res = await patchWorkItem(item.id, {
      title: editTitle().trim(),
      column_id: colId,
      priority: editPriority(),
      status: editStatus(),
      start_date: editStartDate() || null,
      end_date: editEndDate() || null,
      custom_values: customValues(),
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not update work item.");
      return;
    }
    setEditItem(null);
    invalidateWorkItems();
    toast.success("Work item updated.");
  };

  const handleCreateQuotation = async (item: WorkItem) => {
    const res = await createQuotationFromWorkItem(item.id);
    if (!res.success) {
      toast.warning(res.message ?? "Could not create quotation.");
      return;
    }
    invalidateWorkItems();
    toast.success(`Quotation ${res.data?.reference_no ?? ""} created.`);
    if (res.data?.edit_url) navigate(res.data.edit_url);
  };

  return (
    <OperationsLayout>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <OperationsWorkspaceSelector />
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
          <A href="/app/operations/packs" class="rounded-lg border border-stroke px-3 py-2 text-sm font-medium text-text-primary hover:bg-slate-50">
            Industry packs
          </A>
          <A href={OPERATIONS_SETTINGS_HREF.workItem} class="rounded-lg border border-stroke px-3 py-2 text-sm font-medium text-text-primary hover:bg-slate-50">
            Form settings
          </A>
          <Show when={canConfigBoard() && activeWorkspace()}>
            <button
              type="button"
              class="rounded-lg border border-stroke px-3 py-2 text-sm font-medium text-text-primary hover:bg-slate-50"
              onClick={() => setBoardSettingsOpen(true)}
            >
              Board settings
            </button>
          </Show>
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

      <Show when={!hasValidWorkspace()} fallback={null}>
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

      <Show when={hasValidWorkspace()}>
        <Show when={items.isError}>
          <p class="mb-3 text-sm text-red-600">
            {(items.error as Error)?.message ?? "Failed to load work items."}
          </p>
        </Show>

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
            rows={tableRows()}
            loading={items.isFetching && !items.data}
            selectedId={selectedId()}
            onSelect={setSelectedId}
            onEdit={openEditItem}
            onNew={openNewItem}
            showNew={canCreateItem()}
            codeKey="title"
            nameKey="title"
            sortKey={sort()}
            sortOrder={order()}
            onSort={toggleSort}
            page={page()}
            pageSize={pageSize}
            total={tableTotal()}
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
            loading={items.isFetching && !items.data}
            renderCard={(item) => (
              <KanbanCard
                title={item.title}
                subtitle={PRIORITY_LABELS[item.priority] ?? item.priority}
                badge={item.column_name}
                details={itemDetails(item)}
                onClick={() => openEditItem(item)}
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
            <For each={packOptions()}>
              {(p) => (
                <option value={p.pack_code}>
                  {p.pack_name}
                  {p.summary ? ` — ${p.summary}` : ""}
                </option>
              )}
            </For>
          </select>
          <Show when={packs.isError}>
            <p class="mt-1 text-xs text-amber-700">
              Could not refresh pack list from server; showing built-in packs.
            </p>
          </Show>
          <Show when={selectedPack()?.summary}>
            <p class="mt-1 text-xs text-text-secondary">{selectedPack()!.summary}</p>
          </Show>
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
        <CustomFieldsSection
          entityType={OPERATIONS_ENTITY.workItem}
          values={customValues}
          onChange={setCustom}
        />
      </EntityModal>

      <EntityModal
        open={editItem() != null}
        title="Edit work item"
        onClose={() => setEditItem(null)}
        onSave={() => (canEditItem() ? void saveEditItem() : setEditItem(null))}
        saving={saving()}
      >
        <Field label="Title">
          <input class={inputClass} value={editTitle()} onInput={(e) => setEditTitle(e.currentTarget.value)} disabled={!canEditItem()} />
        </Field>
        <Field label="Column">
          <select
            class={inputClass}
            value={editColumnId() ?? ""}
            onChange={(e) => setEditColumnId(Number(e.currentTarget.value) || null)}
            disabled={!canEditItem()}
          >
            <For each={columns.data ?? []}>
              {(col) => <option value={col.id}>{col.column_name}</option>}
            </For>
          </select>
        </Field>
        <Field label="Status">
          <select class={inputClass} value={editStatus()} onChange={(e) => setEditStatus(e.currentTarget.value)} disabled={!canEditItem()}>
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="done">Done</option>
            <option value="blocked">Blocked</option>
          </select>
        </Field>
        <Field label="Priority">
          <select class={inputClass} value={editPriority()} onChange={(e) => setEditPriority(e.currentTarget.value)} disabled={!canEditItem()}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </Field>
        <Field label="Start date">
          <input type="date" class={inputClass} value={editStartDate()} onInput={(e) => setEditStartDate(e.currentTarget.value)} disabled={!canEditItem()} />
        </Field>
        <Field label="End date">
          <input type="date" class={inputClass} value={editEndDate()} onInput={(e) => setEditEndDate(e.currentTarget.value)} disabled={!canEditItem()} />
        </Field>
        <CustomFieldsSection
          entityType={OPERATIONS_ENTITY.workItem}
          values={customValues}
          onChange={setCustom}
        />
        <Show when={editItem()}>
          {(item) => (
            <WorkItemLinksPanel
              workItemId={item().id}
              canEdit={canEditItem()}
              onChanged={() => invalidateWorkItems()}
            />
          )}
        </Show>
      </EntityModal>

      <Show when={activeWorkspace()}>
        {(ws) => (
          <OperationsBoardSettingsModal
            open={boardSettingsOpen()}
            workspace={ws()}
            columns={columns.data ?? []}
            canEdit={canConfigBoard()}
            onClose={() => setBoardSettingsOpen(false)}
            onChanged={() => {
              invalidateWorkspaces();
              invalidateColumns();
              invalidateWorkItems();
            }}
          />
        )}
      </Show>
    </OperationsLayout>
  );
}
