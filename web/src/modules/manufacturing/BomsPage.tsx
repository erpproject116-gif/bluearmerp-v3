import { createSignal, For, Show, createResource } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { apiFetch } from "../../shared/api";
import { LookupCombo, type LookupOption } from "../../shared/LookupCombo";
import { UnitLookupCombo, formatUnitLabel } from "../../shared/UnitLookupCombo";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import { ModalFormGuide } from "../../shared/ModalFormGuide";
import { FormErrorSummary } from "../../shared/FormErrorSummary";
import { collectRequiredFieldErrors, handleSaveResult } from "../../shared/handleSaveResult";
import type { FormErrors } from "../../shared/formValidation";
import { useToast } from "../../shared/toast";
import { useDocumentDraft } from "../../shared/useDocumentDraft";
import { DRAFT_ENTITY } from "../../shared/entityTypes";
import { useListState } from "../../shared/useListState";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { hasPermission, useAuth } from "../../shared/auth-context";
import { useProductionMode } from "../production/ProductionModeLayout";
import { recipesHref } from "../production/mfgProductionMode";
type BomLine = {
  id?: number;
  line_no: number;
  component_item_id: number;
  component_code?: string;
  component_name?: string;
  qty: number;
  unit_id?: number | null;
  unit_code?: string;
  /** Textbox value; parsed safely for stock math (blank/invalid → 0). */
  scrap_input?: string;
  scrap_qty?: number;
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
  bom_type?: string;
  expected_yield_pct_min?: number | null;
  expected_yield_pct_max?: number | null;
  is_active: boolean;
  notes?: string | null;
  components?: string;
  lines?: BomLine[];
};

type Conversion = { from_unit_id: number; to_unit_id: number; factor: number };

/** Parse qty from a free textbox without breaking calc (empty / non-numeric → 0). */
function parseQtyInput(raw: string | number | undefined | null): number {
  if (raw == null || raw === "") return 0;
  if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 ? raw : 0;
  const n = Number(String(raw).replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function lineScrapQty(ln: BomLine): number {
  if (ln.scrap_input != null) return parseQtyInput(ln.scrap_input);
  return parseQtyInput(ln.scrap_qty);
}

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
  const need = Number(ln.qty) + lineScrapQty(ln);
  if (!baseId || !fromId || !(need > 0)) return null;
  const converted = convertClient(fromId, baseId, need, convs);
  if (converted == null) {
    return { qty: 0, code: ln.base_unit_code ?? "", missing: true };
  }
  return {
    qty: converted,
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
  return { line_no: 1, component_item_id: 0, qty: 1, scrap_input: "", unit_id: null };
}

export default function BomsPage() {
  const { mode, copy } = useProductionMode();
  const navigate = useNavigate();
  const auth = useAuth();
  const canBulkDeactivate = () => hasPermission(auth.me, "manufacturing.boms_bulk", "write");
  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } = useListState(
    "updated_at",
    25,
    { defaultOrder: "desc" },
  );
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [selectedIds, setSelectedIds] = createSignal<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = createSignal(false);
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
  const [outputUnitLabel, setOutputUnitLabel] = createSignal("");
  const [yieldPct, setYieldPct] = createSignal("100");
  const [expectedYieldMin, setExpectedYieldMin] = createSignal("");
  const [expectedYieldMax, setExpectedYieldMax] = createSignal("");
  const [fieldErrors, setFieldErrors] = createSignal<FormErrors>({});
  const [notes, setNotes] = createSignal("");
  const [lines, setLines] = createSignal<BomLine[]>([emptyLine()]);
  const [lineLabels, setLineLabels] = createSignal<Record<number, string>>({});
  const [lineUnitLabels, setLineUnitLabels] = createSignal<Record<number, string>>({});
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const client = useQueryClient();

  const [conversions, { refetch: refreshConversions }] = createResource(async () => {
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
    qs.set("bom_type", mode);
    return {
      queryKey: ["mfg-boms", mode, page(), pageSize, sort(), order(), q(), statusFilter()],
      queryFn: async () => {
        const res = await apiFetch<Bom[]>(`/api/v1/manufacturing/boms?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
    };
  });

  const invalidate = async () => {
    await client.invalidateQueries({ queryKey: ["mfg-boms"] });
    await client.refetchQueries({ queryKey: ["mfg-boms"] });
  };

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
    setOutputUnitLabel("");
    setYieldPct("100");
    setExpectedYieldMin("");
    setExpectedYieldMax("");
    setFieldErrors({});
    setNotes("");
    setLines([emptyLine()]);
    setLineLabels({});
    setLineUnitLabels({});
    setModalOpen(true);
  };

  const openEdit = async (row: Bom) => {
    const res = await apiFetch<Bom>(`/api/v1/manufacturing/boms/${row.id}`);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? "Failed to load BOM.");
      return;
    }
    const detail = res.data;
    const detailType = detail.bom_type === "disassembly" ? "disassembly" : "assembly";
    if (detailType !== mode) {
      toast.warning(`This recipe is ${detailType === "disassembly" ? "Disassembly" : "Assembly"}. Opening in the correct section.`);
      navigate(recipesHref(detailType));
      return;
    }
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
    setOutputUnitLabel(detail.output_unit_code ?? "");
    setYieldPct(String(detail.yield_pct ?? 100));
    setExpectedYieldMin(detail.expected_yield_pct_min != null ? String(detail.expected_yield_pct_min) : "");
    setExpectedYieldMax(detail.expected_yield_pct_max != null ? String(detail.expected_yield_pct_max) : "");
    setFieldErrors({});
    setNotes(detail.notes ?? "");
    const loaded = detail.lines?.length ? detail.lines : [emptyLine()];
    setLines(
      loaded.map((ln) => ({
        ...ln,
        scrap_input: ln.scrap_qty != null && ln.scrap_qty !== 0 ? String(ln.scrap_qty) : ln.scrap_input ?? "",
      })),
    );
    setLineLabels(Object.fromEntries(loaded.map((ln, i) => [i, [ln.component_code, ln.component_name].filter(Boolean).join(" — ")])));
    setLineUnitLabels(Object.fromEntries(loaded.map((ln, i) => [i, ln.unit_code ? formatUnitLabel({ code: ln.unit_code, name: ln.unit_code }) : ""])));
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
      output_unit_label: outputUnitLabel(),
      yield_pct: yieldPct(),
      expected_yield_min: expectedYieldMin(),
      expected_yield_max: expectedYieldMax(),
      bom_type: mode,
      notes: notes(),
      lines: lines(),
      line_labels: lineLabels(),
      line_unit_labels: lineUnitLabels(),
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
      setOutputUnitLabel(payload.output_unit_label ?? "");
      setYieldPct(payload.yield_pct ?? "100");
      setExpectedYieldMin(payload.expected_yield_min ?? "");
      setExpectedYieldMax(payload.expected_yield_max ?? "");
      setNotes(payload.notes ?? "");
      setLines(payload.lines?.length ? payload.lines : [emptyLine()]);
      setLineLabels(payload.line_labels ?? {});
      setLineUnitLabels(payload.line_unit_labels ?? {});
    },
    enabled: () => modalOpen(),
    autoApply: () => modalOpen() && !editing(),
  });

  const addLine = () => setLines((prev) => [...prev, { ...emptyLine(), line_no: prev.length + 1 }]);

  const save = async () => {
    const errs = collectRequiredFieldErrors(
      {
        bom_code: bomCode(),
        bom_name: bomName(),
        finished_item_id: finishedItemId(),
      },
      [
        { key: "bom_code", label: "Recipe code" },
        { key: "bom_name", label: copy.bomNameLabel },
        { key: "finished_item_id", label: copy.headerItemLabel },
      ],
    );
    const bodyLines = lines()
      .filter((ln) => ln.component_item_id > 0 && Number(ln.qty) > 0)
      .map((ln) => ({
        component_item_id: ln.component_item_id,
        qty: Number(ln.qty),
        unit_id: ln.unit_id || null,
        scrap_qty: copy.showScrap ? lineScrapQty(ln) : 0,
      }));
    if (bodyLines.length === 0) {
      errs.lines =
        mode === "disassembly"
          ? "Add at least one output piece."
          : "Add at least one raw material line.";
    }
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    const payload: Record<string, unknown> = {
      bom_code: bomCode().trim(),
      bom_name: bomName().trim(),
      finished_item_id: finishedItemId(),
      default_location_id: locationId() ?? null,
      output_qty: Number(outputQty()) || 1,
      output_unit_id: outputUnitId(),
      yield_pct: Number(yieldPct()) || 100,
      bom_type: mode,
      is_active: isActive(),
      notes: notes().trim() || null,
      lines: bodyLines,
    };
    if (mode === "disassembly") {
      const minRaw = expectedYieldMin().trim();
      const maxRaw = expectedYieldMax().trim();
      payload.expected_yield_pct_min = minRaw ? Number(minRaw) : null;
      payload.expected_yield_pct_max = maxRaw ? Number(maxRaw) : null;
    }
    const ed = editing();
    setSaving(true);
    const res = await apiFetch(
      ed ? `/api/v1/manufacturing/boms/${ed.id}` : "/api/v1/manufacturing/boms",
      { method: ed ? "PATCH" : "POST", body: JSON.stringify(payload) },
      { silent: true },
    );
    setSaving(false);
    const ok = handleSaveResult(res, toast, ed ? "Recipe updated." : "Recipe created.", {
      onFieldErrors: setFieldErrors,
    });
    if (!ok) return;
    await draft.clearOnSave();
    setModalOpen(false);
    setQ("");
    setStatusFilter("active");
    setPage(1);
    await invalidate();
  };

  const bulkDeactivate = async () => {
    const ids = [...selectedIds()];
    if (ids.length === 0 || !canBulkDeactivate()) return;
    if (!window.confirm(`Deactivate ${ids.length} selected BOM(s)? Active recipes will be marked inactive.`)) return;
    setBulkBusy(true);
    const res = await apiFetch<{ updated: number; skipped: number }>(
      "/api/v1/manufacturing/boms/actions/bulk-deactivate",
      { method: "POST", body: JSON.stringify({ ids }) },
      { silent: true },
    );
    setBulkBusy(false);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? "Bulk deactivate failed.");
      return;
    }
    toast.success(`Deactivated ${res.data.updated} BOM(s); ${res.data.skipped} skipped.`);
    setSelectedIds(new Set<number>());
    await invalidate();
  };

  return (
    <>
      <p class="mb-3 text-sm text-text-secondary">
        <span class="font-medium text-text-primary">{copy.recipeTitle}:</span>{" "}
        {copy.stockHint}. Amounts are per one recipe batch.
      </p>
      <SpreadsheetGrid<Bom>
        columns={[
          { key: "bom_code", header: "Recipe code", clickable: true },
          { key: "bom_name", header: copy.bomNameLabel, clickable: true },
          { key: "finished_item_name", header: copy.headerItemLabel },
          { key: "components", header: mode === "disassembly" ? "Outputs" : "Materials" },
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
        selectable
        selectedIds={selectedIds()}
        onSelectionChange={(ids) => setSelectedIds(new Set(ids))}
        onNew={openNew}
        onEdit={openEdit}
        settingsHref={recipesHref(mode)}
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
        onRefresh={() => void invalidate()}
        toolbarExtra={
          <Show when={canBulkDeactivate() && statusFilter() !== "inactive"}>
            <button
              type="button"
              class="rounded-lg border border-stroke px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
              disabled={selectedIds().size === 0 || bulkBusy()}
              onClick={() => void bulkDeactivate()}
            >
              Bulk deactivate{selectedIds().size > 0 ? ` (${selectedIds().size})` : ""}
            </button>
          </Show>
        }
      />
      <Show when={list.isError}>
        <p class="mt-2 text-sm text-red-600">{list.error instanceof Error ? list.error.message : "Failed to load BOMs."}</p>
      </Show>

      <EntityModal
        open={modalOpen()}
        title={editing() ? `Edit ${copy.recipeTitle.replace(/s$/, "")}` : copy.newRecipeTitle}
        onClose={() => setModalOpen(false)}
        onSave={() => void save()}
        saving={saving()}
      >
        <div class="col-span-full">
          <draft.DraftBanner />
        </div>
        <FormErrorSummary errors={fieldErrors} />
        <ModalFormGuide guideId={copy.bomGuideId} spanFull />
        <Field label="Recipe code *">
          <input class={inputClass} value={bomCode()} onInput={(e) => setBomCode(e.currentTarget.value)} />
        </Field>
        <Field label={`${copy.bomNameLabel} *`}>
          <input class={inputClass} value={bomName()} onInput={(e) => setBomName(e.currentTarget.value)} />
        </Field>
        <label class="flex items-end gap-2 pb-2 text-sm">
          <input type="checkbox" checked={isActive()} onChange={(e) => setIsActive(e.currentTarget.checked)} />
          Active
        </label>
        <div class="sm:col-span-2 lg:col-span-2">
          <LookupCombo
            label={copy.headerItemLabel}
            required
            value={finishedItemLabel}
            selectedId={finishedItemId}
            onInput={setFinishedItemLabel}
            onSelect={(o) => {
              setFinishedItemId(o.id);
              setFinishedItemLabel(o.label);
              const meta = o.meta as { base_unit_id?: number; base_unit_code?: string } | undefined;
              if (meta?.base_unit_id) {
                setOutputUnitId(meta.base_unit_id);
                setOutputUnitLabel(meta.base_unit_code ? formatUnitLabel({ code: meta.base_unit_code, name: meta.base_unit_code }) : "");
              }
            }}
            onClear={() => { setFinishedItemId(null); setFinishedItemLabel(""); }}
            fetchOptions={fetchItems}
          />
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
        <Field label={`${copy.batchQtyLabel} *`}>
          <input class={inputClass} type="number" min="0" value={outputQty()} onInput={(e) => setOutputQty(e.currentTarget.value)} />
        </Field>
        <UnitLookupCombo
          label="Batch UoM"
          selectedId={outputUnitId}
          value={outputUnitLabel}
          onInput={setOutputUnitLabel}
          onSelect={(u) => {
            setOutputUnitId(u.id);
            setOutputUnitLabel(formatUnitLabel(u));
            refreshConversions();
          }}
          onClear={() => {
            setOutputUnitId(null);
            setOutputUnitLabel("");
          }}
        />
        <Field label={copy.yieldLabel} description={copy.yieldDescription}>
          <input class={inputClass} type="number" min="0" value={yieldPct()} onInput={(e) => setYieldPct(e.currentTarget.value)} />
        </Field>
        <Show when={mode === "disassembly"}>
          <Field label={copy.expectedYieldMinLabel} description={copy.expectedYieldMinDescription}>
            <input class={inputClass} type="number" min="0" value={expectedYieldMin()} onInput={(e) => setExpectedYieldMin(e.currentTarget.value)} />
          </Field>
          <Field label={copy.expectedYieldMaxLabel} description={copy.expectedYieldMaxDescription}>
            <input class={inputClass} type="number" min="0" value={expectedYieldMax()} onInput={(e) => setExpectedYieldMax(e.currentTarget.value)} />
          </Field>
        </Show>
        <div class="col-span-full sm:col-span-2 lg:col-span-3">
          <Field label="Notes">
            <textarea class={inputClass} rows={2} value={notes()} onInput={(e) => setNotes(e.currentTarget.value)} />
          </Field>
        </div>
        <Show when={copy.showScrap}>
          <p class="col-span-full text-xs text-text-secondary">
            Stock issue uses <strong>{copy.lineQtyLabel} + {copy.scrapLabel}</strong> (numeric only). Blank scrap is fine.
          </p>
        </Show>
        <p class="col-span-full text-xs text-text-secondary">{copy.stockHint}</p>
        <div class="col-span-full space-y-2">
          <p class="text-sm font-medium text-text-primary">{copy.lineSectionTitle}</p>
          <For each={lines()}>
            {(ln, idx) => {
              const preview = () => liveStockPreview(ln, conversions() ?? []);
              return (
                <div class={`grid grid-cols-1 items-end gap-2 rounded border border-stroke p-2 ${copy.showScrap ? "sm:grid-cols-[minmax(0,1.1fr)_4.5rem_minmax(8rem,0.85fr)_5.5rem_auto]" : "sm:grid-cols-[minmax(0,1.1fr)_4.5rem_minmax(8rem,0.85fr)_auto]"}`}>
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
                      if (meta?.base_unit_code) {
                        setLineUnitLabels((p) => ({
                          ...p,
                          [idx()]: formatUnitLabel({ code: meta.base_unit_code!, name: meta.base_unit_code! }),
                        }));
                      }
                    }}
                    onClear={() => {
                      setLines((prev) => prev.map((row, i) => (i === idx() ? { ...row, component_item_id: 0 } : row)));
                      setLineLabels((p) => ({ ...p, [idx()]: "" }));
                    }}
                    fetchOptions={fetchItems}
                  />
                  <label class="text-sm">
                    <span class="text-text-secondary">{copy.lineQtyLabel}</span>
                    <input
                      type="number"
                      class={`${inputClass} mt-1`}
                      min="0"
                      value={ln.qty}
                      onInput={(e) => {
                        const v = Number(e.currentTarget.value);
                        setLines((prev) => prev.map((row, i) => (i === idx() ? { ...row, qty: v } : row)));
                      }}
                    />
                  </label>
                  <UnitLookupCombo
                    label="UoM"
                    selectedId={() => ln.unit_id ?? null}
                    value={() => lineUnitLabels()[idx()] ?? ln.unit_code ?? ""}
                    onInput={(v) => setLineUnitLabels((p) => ({ ...p, [idx()]: v }))}
                    onSelect={(u) => {
                      setLines((prev) =>
                        prev.map((row, i) => (i === idx() ? { ...row, unit_id: u.id, unit_code: u.code } : row)),
                      );
                      setLineUnitLabels((p) => ({ ...p, [idx()]: formatUnitLabel(u) }));
                      refreshConversions();
                    }}
                    onClear={() => {
                      setLines((prev) => prev.map((row, i) => (i === idx() ? { ...row, unit_id: null, unit_code: "" } : row)));
                      setLineUnitLabels((p) => ({ ...p, [idx()]: "" }));
                    }}
                  />
                  <Show when={copy.showScrap}>
                    <label class="text-sm">
                      <span class="text-text-secondary">{copy.scrapLabel}</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        class={`${inputClass} mt-1`}
                        placeholder="0"
                        value={ln.scrap_input ?? ""}
                        onInput={(e) => {
                          const v = e.currentTarget.value;
                          setLines((prev) => prev.map((row, i) => (i === idx() ? { ...row, scrap_input: v } : row)));
                        }}
                      />
                    </label>
                  </Show>
                  {(() => {
                    const prev = preview();
                    if (!prev) return <span class="hidden sm:block" />;
                    return (
                      <span class={`pb-2 text-xs leading-tight sm:max-w-[9rem] ${prev.missing ? "text-amber-700" : "text-text-secondary"}`}>
                        {prev.missing ? "Need conversion" : `Stock ≈ ${prev.qty.toFixed(4)} ${prev.code}`}
                      </span>
                    );
                  })()}
                </div>
              );
            }}
          </For>
          <button type="button" class="text-sm text-brand-600 hover:underline" onClick={addLine}>
            + {copy.addLineLabel}
          </button>
        </div>
      </EntityModal>
    </>
  );
}
