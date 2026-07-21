import { createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { LookupCombo, type LookupOption } from "../../shared/LookupCombo";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { useDocumentDraft } from "../../shared/useDocumentDraft";
import { DRAFT_ENTITY } from "../../shared/entityTypes";
import { useListState } from "../../shared/useListState";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { hasPermission, useAuth } from "../../shared/auth-context";
import { ManufacturingLayout } from "./ManufacturingLayout";

type WorkOrder = {
  id: number;
  work_order_no: string;
  bom_id?: number;
  bom_code?: string;
  bom_name?: string;
  finished_item_name?: string;
  finished_base_unit_code?: string;
  location_id?: number;
  location_name?: string;
  qty_to_produce: number;
  qty_produced: number;
  status: string;
  order_date: string;
  notes?: string | null;
};

type BomOption = { id: number; bom_code: string; bom_name: string };

type MaterialNeedLine = {
  component_item_id: number;
  component_code: string;
  component_name: string;
  bom_qty: number;
  bom_unit_code: string;
  scrap_qty: number;
  stock_to_issue: number;
  stock_unit_code: string;
  qty_on_hand: number;
  shortage: number;
};

type MaterialNeeds = {
  work_order_id: number;
  qty_to_produce: number;
  finished_base_unit_code: string;
  output_qty: number;
  yield_pct: number;
  receive_qty: number;
  lines: MaterialNeedLine[];
};

async function fetchBoms(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<BomOption[]>(`/api/v1/manufacturing/boms?${qs}`);
  return (res.data ?? []).map((b) => ({ id: b.id, label: `${b.bom_code} — ${b.bom_name}` }));
}

async function fetchLocations(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; location_name: string }[]>(`/api/v1/inventory/locations?${qs}`);
  return (res.data ?? []).map((l) => ({ id: l.id, label: l.location_name }));
}

const STATUS_TABS = [
  { value: "", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "released", label: "Released" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export default function WorkOrdersPage() {
  const auth = useAuth();
  const canRelease = () => hasPermission(auth.me, "manufacturing.work_orders_release", "write");
  const canComplete = () => hasPermission(auth.me, "manufacturing.work_orders_complete", "write");
  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } =
    useListState("order_date", 25, { defaultOrder: "desc", defaultStatus: "" });
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<WorkOrder | null>(null);
  const [bomId, setBomId] = createSignal<number | null>(null);
  const [bomLabel, setBomLabel] = createSignal("");
  const [locationId, setLocationId] = createSignal<number | null>(null);
  const [locationLabel, setLocationLabel] = createSignal("");
  const [qty, setQty] = createSignal("1");
  const [finishedUnit, setFinishedUnit] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [actionId, setActionId] = createSignal<number | null>(null);
  const [materials, setMaterials] = createSignal<MaterialNeeds | null>(null);
  const toast = useToast();
  const client = useQueryClient();

  const list = createQuery(() => {
    const qs = new URLSearchParams({
      page: String(page()),
      pageSize: String(pageSize),
      sort: sort(),
      order: order(),
    });
    if (q()) qs.set("q", q());
    if (statusFilter()) qs.set("status", statusFilter());
    return {
      queryKey: ["mfg-work-orders", page(), pageSize, sort(), order(), q(), statusFilter()],
      queryFn: async () => {
        const res = await apiFetch<WorkOrder[]>(`/api/v1/manufacturing/work-orders?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
    };
  });

  const invalidate = () => void client.invalidateQueries({ queryKey: ["mfg-work-orders"] });

  const loadMaterials = async (woId: number) => {
    const res = await apiFetch<MaterialNeeds>(`/api/v1/manufacturing/work-orders/${woId}/material-needs`);
    if (res.success && res.data) {
      setMaterials(res.data);
      setFinishedUnit(res.data.finished_base_unit_code || "");
    } else {
      setMaterials(null);
    }
  };

  const openNew = () => {
    setEditing(null);
    setBomId(null);
    setBomLabel("");
    setLocationId(null);
    setLocationLabel("");
    setQty("1");
    setFinishedUnit("");
    setMaterials(null);
    setModalOpen(true);
  };

  const openEdit = async (row: WorkOrder) => {
    const res = await apiFetch<WorkOrder>(`/api/v1/manufacturing/work-orders/${row.id}`);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? "Failed to load work order.");
      return;
    }
    const detail = res.data;
    setEditing(detail);
    setBomId(detail.bom_id ?? null);
    setBomLabel([detail.bom_code, detail.bom_name].filter(Boolean).join(" — "));
    setLocationId(detail.location_id ?? null);
    setLocationLabel(detail.location_name ?? "");
    setQty(String(detail.qty_to_produce));
    setFinishedUnit(detail.finished_base_unit_code ?? "");
    setModalOpen(true);
    await loadMaterials(detail.id);
  };

  const draft = useDocumentDraft({
    entityType: DRAFT_ENTITY.mfgWorkOrder,
    draftKey: () => (editing() ? `edit-${editing()!.id}` : "new"),
    getPayload: () => ({
      bom_id: bomId(),
      bom_label: bomLabel(),
      location_id: locationId(),
      location_label: locationLabel(),
      qty: qty(),
    }),
    onApply: (payload) => {
      setBomId(payload.bom_id);
      setBomLabel(payload.bom_label);
      setLocationId(payload.location_id);
      setLocationLabel(payload.location_label);
      setQty(payload.qty);
    },
    enabled: () => modalOpen() && !editing(),
    autoApply: () => modalOpen() && !editing(),
  });

  const saveWo = async () => {
    if (!editing() && (!bomId() || Number(qty()) <= 0)) {
      toast.warning("Select BOM and quantity.");
      return;
    }
    if (editing() && editing()!.status !== "draft") {
      toast.warning("Only draft work orders can be edited.");
      return;
    }
    setSaving(true);
    const ed = editing();
    let res;
    if (ed) {
      res = await apiFetch(
        `/api/v1/manufacturing/work-orders/${ed.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            location_id: locationId() ?? undefined,
            qty_to_produce: Number(qty()),
          }),
        },
        { silent: true },
      );
    } else {
      res = await apiFetch(
        "/api/v1/manufacturing/work-orders",
        {
          method: "POST",
          body: JSON.stringify({
            bom_id: bomId(),
            location_id: locationId() ?? undefined,
            qty_to_produce: Number(qty()),
          }),
        },
        { silent: true },
      );
    }
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to save work order.");
      return;
    }
    toast.success(ed ? "Work order updated." : "Work order created.");
    await draft.clearOnSave();
    const saved = res.data as WorkOrder | undefined;
    if (saved?.id) {
      setEditing(saved);
      await loadMaterials(saved.id);
    } else {
      setModalOpen(false);
    }
    invalidate();
  };

  const release = async (row: WorkOrder) => {
    setActionId(row.id);
    const res = await apiFetch(`/api/v1/manufacturing/work-orders/${row.id}/release`, { method: "POST" });
    setActionId(null);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to release.");
      return;
    }
    toast.success("Work order released.");
    invalidate();
  };

  const complete = async (row: WorkOrder) => {
    const needsRes = await apiFetch<MaterialNeeds>(`/api/v1/manufacturing/work-orders/${row.id}/material-needs`);
    const needs = needsRes.data;
    const unit = needs?.finished_base_unit_code || row.finished_base_unit_code || "";
    const linesSummary = (needs?.lines ?? [])
      .map((l) => `• ${l.component_code}: ${l.stock_to_issue.toFixed(4)} ${l.stock_unit_code} (on hand ${l.qty_on_hand.toFixed(4)})`)
      .join("\n");
    const msg = [
      `Complete ${row.work_order_no}?`,
      `Will receive ${row.qty_to_produce} ${unit} finished.`,
      linesSummary ? `\nMaterials to issue:\n${linesSummary}` : "",
      "\nUses live BOM (used + scrap/spare, convert, yield).",
    ].join("\n");
    if (!window.confirm(msg)) return;
    setActionId(row.id);
    const res = await apiFetch(`/api/v1/manufacturing/work-orders/${row.id}/complete`, { method: "POST" });
    setActionId(null);
    if (!res.success) {
      const detail = res.errors?.stock || res.message;
      toast.warning(detail ?? "Failed to complete.");
      return;
    }
    toast.success("Work order completed.");
    invalidate();
  };

  return (
    <ManufacturingLayout>
      <SpreadsheetGrid<WorkOrder>
        columns={[
          { key: "work_order_no", header: "WO no.", clickable: true },
          { key: "order_date", header: "Date" },
          { key: "bom_code", header: "BOM" },
          { key: "finished_item_name", header: "Finished item" },
          { key: "location_name", header: "Location" },
          {
            key: "qty_to_produce",
            header: "Qty",
            render: (r) => `${r.qty_to_produce}${r.finished_base_unit_code ? ` ${r.finished_base_unit_code}` : ""}`,
          },
          {
            key: "status",
            header: "Status",
            sortable: false,
            render: (r) => (
              <div class="flex items-center gap-2 capitalize">
                <span>{r.status.replace(/_/g, " ")}</span>
                <Show when={r.status === "draft" && canRelease()}>
                  <button
                    type="button"
                    class="text-xs text-brand-600 hover:underline disabled:opacity-50"
                    disabled={actionId() === r.id}
                    onClick={(e) => { e.stopPropagation(); void release(r); }}
                  >
                    Release
                  </button>
                </Show>
                <Show when={r.status === "released" && canComplete()}>
                  <button
                    type="button"
                    class="text-xs text-brand-600 hover:underline disabled:opacity-50"
                    disabled={actionId() === r.id}
                    onClick={(e) => { e.stopPropagation(); void complete(r); }}
                  >
                    Complete
                  </button>
                </Show>
              </div>
            ),
          },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onNew={openNew}
        onEdit={(row) => void openEdit(row)}
        settingsHref="/app/inventory/serial-lot/manufacturing/work-orders"
        codeKey="work_order_no"
        nameKey="bom_code"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        page={page()}
        pageSize={pageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        search={q()}
        onSearchChange={setQ}
        searchPlaceholder="Search WO, BOM, item…"
        status={statusFilter()}
        onStatusChange={setStatusFilter}
        statusLabel="Status"
        statusOptions={STATUS_TABS}
        onRefresh={invalidate}
      />

      <EntityModal
        open={modalOpen()}
        title={editing() ? `Work Order ${editing()!.work_order_no}` : "New Work Order"}
        onClose={() => setModalOpen(false)}
        onSave={() => {
          if (editing() && editing()!.status !== "draft") {
            setModalOpen(false);
            return;
          }
          void saveWo();
        }}
        saving={saving()}
        singleColumn
        saveLabel={editing() ? (editing()!.status === "draft" ? "Save" : "Close") : "Create"}
      >
        <Show when={!editing()}>
          <draft.DraftBanner />
        </Show>
        <LookupCombo
          label="BOM"
          required
          value={bomLabel}
          selectedId={bomId}
          onInput={setBomLabel}
          onSelect={(o) => { setBomId(o.id); setBomLabel(o.label); }}
          onClear={() => { setBomId(null); setBomLabel(""); }}
          fetchOptions={fetchBoms}
          disabled={!!editing()}
        />
        <div class="mt-3">
          <LookupCombo
            label="Production location"
            value={locationLabel}
            selectedId={locationId}
            onInput={setLocationLabel}
            onSelect={(o) => { setLocationId(o.id); setLocationLabel(o.label); }}
            onClear={() => { setLocationId(null); setLocationLabel(""); }}
            fetchOptions={fetchLocations}
            disabled={!!editing() && editing()!.status !== "draft"}
          />
        </div>
        <Field label={`Quantity to produce *${finishedUnit() ? ` (${finishedUnit()} — finished base UoM)` : " (finished base UoM)"}`}>
          <input
            class={inputClass}
            type="number"
            min="0"
            value={qty()}
            disabled={!!editing() && editing()!.status !== "draft"}
            onInput={(e) => setQty(e.currentTarget.value)}
          />
        </Field>

        <Show when={materials()}>
          {(m) => (
            <div class="mt-4 space-y-2">
              <p class="text-sm font-medium text-text-primary">Materials needed</p>
              <p class="text-xs text-text-secondary">
                Will receive {m().receive_qty} {m().finished_base_unit_code || finishedUnit()} · BOM output {m().output_qty} · yield {m().yield_pct}%
              </p>
              <div class="overflow-x-auto rounded border border-stroke">
                <table class="min-w-full text-left text-xs">
                  <thead class="bg-slate-50 text-text-secondary">
                    <tr>
                      <th class="px-2 py-1.5">Component</th>
                      <th class="px-2 py-1.5">Used</th>
                      <th class="px-2 py-1.5">Scrap/spare</th>
                      <th class="px-2 py-1.5">To issue (stock)</th>
                      <th class="px-2 py-1.5">On hand</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={m().lines}>
                      {(ln) => (
                        <tr class={ln.shortage > 0 ? "bg-red-50 text-red-800" : ""}>
                          <td class="px-2 py-1.5">{ln.component_code} — {ln.component_name}</td>
                          <td class="px-2 py-1.5">{ln.bom_qty} {ln.bom_unit_code}</td>
                          <td class="px-2 py-1.5">{ln.scrap_qty} {ln.bom_unit_code}</td>
                          <td class="px-2 py-1.5">{ln.stock_to_issue.toFixed(4)} {ln.stock_unit_code}</td>
                          <td class="px-2 py-1.5">
                            {ln.qty_on_hand.toFixed(4)}
                            <Show when={ln.shortage > 0}>
                              <span class="ml-1 font-medium">(short {ln.shortage.toFixed(4)})</span>
                            </Show>
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Show>
      </EntityModal>
    </ManufacturingLayout>
  );
}
