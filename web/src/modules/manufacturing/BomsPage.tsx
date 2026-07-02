import { createSignal, For } from "solid-js";
import { apiFetch } from "../../shared/api";
import { LookupCombo, type LookupOption } from "../../shared/LookupCombo";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { useListState } from "../../shared/useListState";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { ManufacturingLayout } from "./ManufacturingLayout";

type BomLine = {
  id?: number;
  line_no: number;
  component_item_id: number;
  component_code?: string;
  component_name?: string;
  qty: number;
};

type Bom = {
  id: number;
  bom_code: string;
  bom_name: string;
  finished_item_id: number;
  finished_item_code?: string;
  finished_item_name?: string;
  default_location_id?: number | null;
  default_location_name?: string;
  is_active: boolean;
  components?: string;
  lines?: BomLine[];
};

async function fetchItems(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active", sort: "item_code", order: "asc" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; item_code: string; item_name: string }[]>(`/api/v1/inventory/items?${qs}`);
  return (res.data ?? []).map((i) => ({ id: i.id, label: `${i.item_code} — ${i.item_name}` }));
}

async function fetchLocations(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; location_name: string }[]>(`/api/v1/inventory/locations?${qs}`);
  return (res.data ?? []).map((l) => ({ id: l.id, label: l.location_name }));
}

function emptyLine(): BomLine {
  return { line_no: 1, component_item_id: 0, qty: 1 };
}

export default function BomsPage() {
  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } = useListState("bom_code");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<Bom | null>(null);
  const [bomCode, setBomCode] = createSignal("");
  const [bomName, setBomName] = createSignal("");
  const [isActive, setIsActive] = createSignal(true);
  const [finishedItemId, setFinishedItemId] = createSignal<number | null>(null);
  const [finishedItemLabel, setFinishedItemLabel] = createSignal("");
  const [locationId, setLocationId] = createSignal<number | null>(null);
  const [locationLabel, setLocationLabel] = createSignal("");
  const [lines, setLines] = createSignal<BomLine[]>([emptyLine()]);
  const [lineLabels, setLineLabels] = createSignal<Record<number, string>>({});
  const [saving, setSaving] = createSignal(false);
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
      queryKey: ["mfg-boms", page(), pageSize, sort(), order(), q(), statusFilter()],
      queryFn: async () => {
        const res = await apiFetch<Bom[]>(`/api/v1/manufacturing/boms?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
    };
  });

  const invalidate = () => void client.invalidateQueries({ queryKey: ["mfg-boms"] });

  const openNew = () => {
    setEditing(null);
    setBomCode("");
    setBomName("");
    setIsActive(true);
    setFinishedItemId(null);
    setFinishedItemLabel("");
    setLocationId(null);
    setLocationLabel("");
    setLines([emptyLine()]);
    setLineLabels({});
    setModalOpen(true);
  };

  const openEdit = async (row: Bom) => {
    const res = await apiFetch<Bom>(`/api/v1/manufacturing/boms/${row.id}`);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? "Failed to load BOM.");
      return;
    }
    const detail = res.data;
    setEditing(detail);
    setBomCode(detail.bom_code);
    setBomName(detail.bom_name);
    setIsActive(detail.is_active);
    setFinishedItemId(detail.finished_item_id);
    setFinishedItemLabel([detail.finished_item_code, detail.finished_item_name].filter(Boolean).join(" — "));
    setLocationId(detail.default_location_id ?? null);
    setLocationLabel(detail.default_location_name ?? "");
    const loaded = detail.lines?.length ? detail.lines : [emptyLine()];
    setLines(loaded);
    setLineLabels(Object.fromEntries(loaded.map((ln, i) => [i, [ln.component_code, ln.component_name].filter(Boolean).join(" — ")])));
    setModalOpen(true);
  };

  const addLine = () => setLines((prev) => [...prev, { ...emptyLine(), line_no: prev.length + 1 }]);

  const save = async () => {
    if (!bomCode().trim() || !bomName().trim() || !finishedItemId()) {
      toast.warning("BOM code, name, and finished item are required.");
      return;
    }
    const bodyLines = lines()
      .filter((ln) => ln.component_item_id > 0 && Number(ln.qty) > 0)
      .map((ln) => ({ component_item_id: ln.component_item_id, qty: Number(ln.qty) }));
    if (bodyLines.length === 0) {
      toast.warning("Add at least one component line.");
      return;
    }
    const payload = {
      bom_code: bomCode().trim(),
      bom_name: bomName().trim(),
      finished_item_id: finishedItemId(),
      default_location_id: locationId() ?? null,
      is_active: isActive(),
      lines: bodyLines,
    };
    const ed = editing();
    setSaving(true);
    const res = await apiFetch(
      ed ? `/api/v1/manufacturing/boms/${ed.id}` : "/api/v1/manufacturing/boms",
      { method: ed ? "PATCH" : "POST", body: JSON.stringify(payload) },
      { silent: true },
    );
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to save BOM.");
      return;
    }
    toast.success(ed ? "BOM updated." : "BOM created.");
    setModalOpen(false);
    invalidate();
  };

  return (
    <ManufacturingLayout>
      <SpreadsheetGrid<Bom>
        columns={[
          { key: "bom_code", header: "BOM code", clickable: true },
          { key: "bom_name", header: "Name", clickable: true },
          { key: "finished_item_name", header: "Finished item" },
          { key: "components", header: "Components" },
          { key: "default_location_name", header: "Default location" },
          {
            key: "is_active",
            header: "Active",
            sortable: false,
            render: (r) => (r.is_active ? "Yes" : "No"),
          },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onNew={openNew}
        onEdit={openEdit}
        settingsHref="/app/inventory/serial-lot/manufacturing/boms"
        codeKey="bom_code"
        nameKey="bom_name"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        page={page()}
        pageSize={pageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        search={q()}
        onSearchChange={setQ}
        searchPlaceholder="Search BOM code, name, item…"
        status={statusFilter()}
        onStatusChange={setStatusFilter}
        statusLabel="Status"
        statusOptions={[
          { value: "", label: "All" },
          { value: "active", label: "Active" },
          { value: "inactive", label: "Inactive" },
        ]}
        onRefresh={invalidate}
      />

      <EntityModal
        open={modalOpen()}
        title={editing() ? "Edit BOM" : "New BOM"}
        onClose={() => setModalOpen(false)}
        onSave={() => void save()}
        saving={saving()}
        singleColumn
      >
        <Field label="BOM code *">
          <input class={inputClass} value={bomCode()} onInput={(e) => setBomCode(e.currentTarget.value)} />
        </Field>
        <Field label="Name *">
          <input class={inputClass} value={bomName()} onInput={(e) => setBomName(e.currentTarget.value)} />
        </Field>
        <LookupCombo
          label="Finished item"
          required
          value={finishedItemLabel}
          selectedId={finishedItemId}
          onInput={setFinishedItemLabel}
          onSelect={(o) => { setFinishedItemId(o.id); setFinishedItemLabel(o.label); }}
          onClear={() => { setFinishedItemId(null); setFinishedItemLabel(""); }}
          fetchOptions={fetchItems}
        />
        <LookupCombo
          label="Default production location"
          value={locationLabel}
          selectedId={locationId}
          onInput={setLocationLabel}
          onSelect={(o) => { setLocationId(o.id); setLocationLabel(o.label); }}
          onClear={() => { setLocationId(null); setLocationLabel(""); }}
          fetchOptions={fetchLocations}
        />
        <label class="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive()} onChange={(e) => setIsActive(e.currentTarget.checked)} />
          Active
        </label>
        <div class="mt-4 space-y-3">
          <p class="text-sm font-medium text-text-primary">Components (per 1 finished unit)</p>
          <For each={lines()}>
            {(ln, idx) => (
              <div class="flex flex-wrap items-end gap-2 rounded border border-stroke p-2">
                <div class="min-w-[200px] flex-1">
                  <LookupCombo
                    label={`Line ${idx() + 1}`}
                    required
                    value={() => lineLabels()[idx()] ?? ""}
                    selectedId={() => ln.component_item_id || null}
                    onInput={(v) => setLineLabels((p) => ({ ...p, [idx()]: v }))}
                    onSelect={(o) => {
                      setLines((prev) => prev.map((row, i) => (i === idx() ? { ...row, component_item_id: o.id } : row)));
                      setLineLabels((p) => ({ ...p, [idx()]: o.label }));
                    }}
                    onClear={() => {
                      setLines((prev) => prev.map((row, i) => (i === idx() ? { ...row, component_item_id: 0 } : row)));
                      setLineLabels((p) => ({ ...p, [idx()]: "" }));
                    }}
                    fetchOptions={fetchItems}
                  />
                </div>
                <label class="text-sm">
                  <span class="text-text-secondary">Qty</span>
                  <input
                    type="number"
                    class={`${inputClass} mt-1 w-24`}
                    min="0"
                    value={ln.qty}
                    onInput={(e) => {
                      const v = Number(e.currentTarget.value);
                      setLines((prev) => prev.map((row, i) => (i === idx() ? { ...row, qty: v } : row)));
                    }}
                  />
                </label>
              </div>
            )}
          </For>
          <button type="button" class="text-sm text-brand-600 hover:underline" onClick={addLine}>
            + Add component
          </button>
        </div>
      </EntityModal>
    </ManufacturingLayout>
  );
}
