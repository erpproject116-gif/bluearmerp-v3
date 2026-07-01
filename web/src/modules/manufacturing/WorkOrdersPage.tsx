import { createSignal, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { LookupCombo, type LookupOption } from "../../shared/LookupCombo";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { useListState } from "../../shared/useListState";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { hasPermission, useAuth } from "../../shared/auth-context";
import { ManufacturingLayout } from "./ManufacturingLayout";

type WorkOrder = {
  id: number;
  work_order_no: string;
  bom_code?: string;
  bom_name?: string;
  finished_item_name?: string;
  location_name?: string;
  qty_to_produce: number;
  qty_produced: number;
  status: string;
  order_date: string;
};

type BomOption = { id: number; bom_code: string; bom_name: string };

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
  const [bomId, setBomId] = createSignal<number | null>(null);
  const [bomLabel, setBomLabel] = createSignal("");
  const [locationId, setLocationId] = createSignal<number | null>(null);
  const [locationLabel, setLocationLabel] = createSignal("");
  const [qty, setQty] = createSignal("1");
  const [saving, setSaving] = createSignal(false);
  const [actionId, setActionId] = createSignal<number | null>(null);
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

  const openNew = () => {
    setBomId(null);
    setBomLabel("");
    setLocationId(null);
    setLocationLabel("");
    setQty("1");
    setModalOpen(true);
  };

  const createWo = async () => {
    if (!bomId() || Number(qty()) <= 0) {
      toast.warning("Select BOM and quantity.");
      return;
    }
    setSaving(true);
    const res = await apiFetch("/api/v1/manufacturing/work-orders", {
      method: "POST",
      body: JSON.stringify({
        bom_id: bomId(),
        location_id: locationId() ?? undefined,
        qty_to_produce: Number(qty()),
      }),
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to create work order.");
      return;
    }
    toast.success("Work order created.");
    setModalOpen(false);
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
    if (!window.confirm(`Complete ${row.work_order_no} and backflush stock?`)) return;
    setActionId(row.id);
    const res = await apiFetch(`/api/v1/manufacturing/work-orders/${row.id}/complete`, { method: "POST" });
    setActionId(null);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to complete.");
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
          { key: "qty_to_produce", header: "Qty" },
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
        onEdit={() => {}}
        settingsHref="/app/manufacturing/work-orders"
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
        title="New Work Order"
        onClose={() => setModalOpen(false)}
        onSave={() => void createWo()}
        saving={saving()}
        singleColumn
      >
        <LookupCombo
          label="BOM"
          required
          value={bomLabel}
          selectedId={bomId}
          onInput={setBomLabel}
          onSelect={(o) => { setBomId(o.id); setBomLabel(o.label); }}
          onClear={() => { setBomId(null); setBomLabel(""); }}
          fetchOptions={fetchBoms}
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
          />
        </div>
        <Field label="Quantity to produce *">
          <input class={inputClass} type="number" min="0" value={qty()} onInput={(e) => setQty(e.currentTarget.value)} />
        </Field>
      </EntityModal>
    </ManufacturingLayout>
  );
}
