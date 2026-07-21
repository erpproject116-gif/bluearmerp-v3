import { createSignal, For, Show, createResource } from "solid-js";
import { apiFetch } from "../../shared/api";
import { LookupCombo, type LookupOption } from "../../shared/LookupCombo";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { useDocumentDraft } from "../../shared/useDocumentDraft";
import { DRAFT_ENTITY } from "../../shared/entityTypes";
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
  unit_id?: number | null;
  unit_code?: string;
  scrap_pct?: number;
  stock_qty_preview?: number;
  base_unit_id?: number;
  base_unit_code?: string;
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
  output_qty?: number;
  output_unit_id?: number | null;
  output_unit_code?: string;
  yield_pct?: number;
  is_active: boolean;
  notes?: string | null;
  components?: string;
  lines?: BomLine[];
};

type UnitOpt = { id: number; code: string; name: string };
type Conversion = { from_unit_id: number; to_unit_id: number; factor: number };

function convertClient(fromId: number, toId: number, qty: number, convs: Conversion[]): number | null {
  if (!fromId || !toId) return null;
  if (fromId === toId) return qty;
  const direct = convs.find((c) => c.from_unit_id === fromId && c.to_unit_id === toId);
  if (direct) return qty * direct.factor;
  const inv = convs.find((c) => c.from_unit_id === toId && c.to_unit_id === fromId);
  if (inv && inv.factor > 0) return qty / inv.factor;
  return null;
}

function liveStockPreview(ln: BomLine, convs: Conversion[]): { qty: number; code: string; missing?: boolean } | null {
  const baseId = ln.base_unit_id;
  const fromId = ln.unit_id ?? baseId;
  if (!baseId || !fromId || !(ln.qty > 0)) return null;
  const converted = convertClient(fromId, baseId, Number(ln.qty), convs);
  if (converted == null) {
    return { qty: 0, code: ln.base_unit_code ?? "", missing: true };
  }
  return {
    qty: converted * (1 + Number(ln.scrap_pct ?? 0) / 100),
    code: ln.base_unit_code ?? "",
  };
}

async function fetchItems(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active", sort: "item_code", order: "asc" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; item_code: string; item_name: string; base_unit_id?: number; base_unit_code?: string }[]>(
    `/api/v1/inventory/items?${qs}`,
  );
  return (res.data ?? []).map((i) => ({
    id: i.id,
    label: `${i.item_code} — ${i.item_name}`,
    meta: { base_unit_id: i.base_unit_id, base_unit_code: i.base_unit_code },
  }));
}

async function fetchLocations(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; location_name: string }[]>(`/api/v1/inventory/locations?${qs}`);
  return (res.data ?? []).map((l) => ({ id: l.id, label: l.location_name }));
}

function emptyLine(): BomLine {
  return { line_no: 1, component_item_id: 0, qty: 1, scrap_pct: 0, unit_id: null };
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
  const [outputQty, setOutputQty] = createSignal("1");
  const [outputUnitId, setOutputUnitId] = createSignal<number | null>(null);
  const [yieldPct, setYieldPct] = createSignal("100");
  const [notes, setNotes] = createSignal("");
  const [lines, setLines] = createSignal<BomLine[]>([emptyLine()]);
  const [lineLabels, setLineLabels] = createSignal<Record<number, string>>({});
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const client = useQueryClient();

  const [units] = createResource(async () => {
    const res = await apiFetch<UnitOpt[]>("/api/v1/inventory/units?page=1&pageSize=200&status=active&sort=code");
    return res.data ?? [];
  });

  const [conversions] = createResource(async () => {
    const res = await apiFetch<Conversion[]>("/api/v1/inventory/unit-conversions");
    return res.data ?? [];
  });

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
    setOutputQty("1");
    setOutputUnitId(null);
    setYieldPct("100");
    setNotes("");
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
    setOutputQty(String(detail.output_qty ?? 1));
    setOutputUnitId(detail.output_unit_id ?? null);
    setYieldPct(String(detail.yield_pct ?? 100));
    setNotes(detail.notes ?? "");
    const loaded = detail.lines?.length ? detail.lines : [emptyLine()];
    setLines(loaded);
    setLineLabels(Object.fromEntries(loaded.map((ln, i) => [i, [ln.component_code, ln.component_name].filter(Boolean).join(" — ")])));
    setModalOpen(true);
  };

  const draft = useDocumentDraft({
    entityType: DRAFT_ENTITY.mfgBom,
    draftKey: () => (editing() ? `edit-${editing()!.id}` : "new"),
    getPayload: () => ({
      bom_code: bomCode(),
      bom_name: bomName(),
      is_active: isActive(),
      finished_item_id: finishedItemId(),
      finished_item_label: finishedItemLabel(),
      location_id: locationId(),
      location_label: locationLabel(),
      output_qty: outputQty(),
      output_unit_id: outputUnitId(),
      yield_pct: yieldPct(),
      notes: notes(),
      lines: lines(),
      line_labels: lineLabels(),
    }),
    onApply: (payload) => {
      setBomCode(payload.bom_code);
      setBomName(payload.bom_name);
      setIsActive(payload.is_active);
      setFinishedItemId(payload.finished_item_id);
      setFinishedItemLabel(payload.finished_item_label);
      setLocationId(payload.location_id);
      setLocationLabel(payload.location_label);
      setOutputQty(payload.output_qty ?? "1");
      setOutputUnitId(payload.output_unit_id ?? null);
      setYieldPct(payload.yield_pct ?? "100");
      setNotes(payload.notes ?? "");
      setLines(payload.lines?.length ? payload.lines : [emptyLine()]);
      setLineLabels(payload.line_labels ?? {});
    },
    enabled: () => modalOpen(),
    autoApply: () => modalOpen() && !editing(),
  });

  const addLine = () => setLines((prev) => [...prev, { ...emptyLine(), line_no: prev.length + 1 }]);

  const save = async () => {
    if (!bomCode().trim() || !bomName().trim() || !finishedItemId()) {
      toast.warning("BOM code, name, and finished item are required.");
      return;
    }
    const bodyLines = lines()
      .filter((ln) => ln.component_item_id > 0 && Number(ln.qty) > 0)
      .map((ln) => ({
        component_item_id: ln.component_item_id,
        qty: Number(ln.qty),
        unit_id: ln.unit_id || null,
        scrap_pct: Number(ln.scrap_pct ?? 0),
      }));
    if (bodyLines.length === 0) {
      toast.warning("Add at least one component line.");
      return;
    }
    const payload = {
      bom_code: bomCode().trim(),
      bom_name: bomName().trim(),
      finished_item_id: finishedItemId(),
      default_location_id: locationId() ?? null,
      output_qty: Number(outputQty()) || 1,
      output_unit_id: outputUnitId(),
      yield_pct: Number(yieldPct()) || 100,
      is_active: isActive(),
      notes: notes().trim() || null,
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
      const detail = res.errors ? Object.values(res.errors).join(" ") : "";
      toast.warning(detail || res.message || "Failed to save BOM.");
      return;
    }
    toast.success(ed ? "BOM updated." : "BOM created.");
    await draft.clearOnSave();
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
        <draft.DraftBanner />
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
          onSelect={(o) => {
            setFinishedItemId(o.id);
            setFinishedItemLabel(o.label);
            const meta = o.meta as { base_unit_id?: number } | undefined;
            if (meta?.base_unit_id) setOutputUnitId(meta.base_unit_id);
          }}
          onClear={() => { setFinishedItemId(null); setFinishedItemLabel(""); }}
          fetchOptions={fetchItems}
        />
        <div class="mt-3 flex flex-wrap gap-3">
          <Field label="Output qty *">
            <input class={inputClass} type="number" min="0" value={outputQty()} onInput={(e) => setOutputQty(e.currentTarget.value)} />
          </Field>
          <label class="text-sm">
            <span class="text-text-secondary">Output UoM</span>
            <select
              class={`${inputClass} mt-1`}
              value={outputUnitId() ?? ""}
              onChange={(e) => setOutputUnitId(e.currentTarget.value ? Number(e.currentTarget.value) : null)}
            >
              <option value="">— finished base —</option>
              <For each={units() ?? []}>{(u) => <option value={u.id}>{u.code}</option>}</For>
            </select>
          </label>
          <Field label="Yield %">
            <input class={inputClass} type="number" min="0" value={yieldPct()} onInput={(e) => setYieldPct(e.currentTarget.value)} />
          </Field>
        </div>
        <LookupCombo
          label="Default production location"
          value={locationLabel}
          selectedId={locationId}
          onInput={setLocationLabel}
          onSelect={(o) => { setLocationId(o.id); setLocationLabel(o.label); }}
          onClear={() => { setLocationId(null); setLocationLabel(""); }}
          fetchOptions={fetchLocations}
        />
        <Field label="Notes">
          <textarea class={inputClass} rows={2} value={notes()} onInput={(e) => setNotes(e.currentTarget.value)} />
        </Field>
        <label class="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive()} onChange={(e) => setIsActive(e.currentTarget.checked)} />
          Active
        </label>
        <p class="mt-2 text-xs text-text-secondary">
          Complete uses the live BOM (convert × scrap × WO qty / output qty ÷ yield). Set conversions under Inventory → Units.
        </p>
        <div class="mt-4 space-y-3">
          <p class="text-sm font-medium text-text-primary">Components (per output batch)</p>
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
                      const meta = o.meta as { base_unit_id?: number; base_unit_code?: string } | undefined;
                      setLines((prev) =>
                        prev.map((row, i) =>
                          i === idx()
                            ? {
                                ...row,
                                component_item_id: o.id,
                                unit_id: meta?.base_unit_id ?? row.unit_id,
                                unit_code: meta?.base_unit_code,
                                base_unit_id: meta?.base_unit_id,
                                base_unit_code: meta?.base_unit_code,
                              }
                            : row,
                        ),
                      );
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
                <label class="text-sm">
                  <span class="text-text-secondary">UoM</span>
                  <select
                    class={`${inputClass} mt-1 w-28`}
                    value={ln.unit_id ?? ""}
                    onChange={(e) => {
                      const id = e.currentTarget.value ? Number(e.currentTarget.value) : null;
                      const code = (units() ?? []).find((u) => u.id === id)?.code;
                      setLines((prev) => prev.map((row, i) => (i === idx() ? { ...row, unit_id: id, unit_code: code } : row)));
                    }}
                  >
                    <option value="">—</option>
                    <For each={units() ?? []}>{(u) => <option value={u.id}>{u.code}</option>}</For>
                  </select>
                </label>
                <label class="text-sm">
                  <span class="text-text-secondary">Scrap %</span>
                  <input
                    type="number"
                    class={`${inputClass} mt-1 w-20`}
                    min="0"
                    value={ln.scrap_pct ?? 0}
                    onInput={(e) => {
                      const v = Number(e.currentTarget.value);
                      setLines((prev) => prev.map((row, i) => (i === idx() ? { ...row, scrap_pct: v } : row)));
                    }}
                  />
                </label>
                {(() => {
                  const prev = liveStockPreview(ln, conversions() ?? []);
                  if (!prev) return null;
                  return (
                    <span class={`pb-2 text-xs ${prev.missing ? "text-amber-700" : "text-text-secondary"}`}>
                      {prev.missing
                        ? "Add conversion for line UoM → stock UoM"
                        : `Stock ≈ ${prev.qty.toFixed(4)} ${prev.code}`}
                    </span>
                  );
                })()}
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
