import { createSignal, For, Show, createResource, createMemo } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
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
import { mfgSuccess, mfgWarn } from "../production/mfgToast";

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
  output_classification?: string;
  stock_qty_preview?: number;
  base_unit_id?: number;
  base_unit_code?: string;
  unit_cost?: number;
  line_total?: number;
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
  additional_cost_type?: string | null;
  direct_labor_cost?: number;
  inbound_freight_cost?: number;
  materials_subtotal?: number;
  additional_cost?: number;
  total_cost?: number;
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

function lineUnitCost(ln: BomLine): number {
  const n = Number(ln.unit_cost);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function lineTotalDisplay(ln: BomLine): number {
  if (ln.line_total != null && Number.isFinite(ln.line_total)) return ln.line_total;
  return lineUnitCost(ln) * Number(ln.qty || 0);
}

function formatCost(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
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
  const res = await apiFetch<
    { id: number; item_code: string; item_name: string; base_unit_id?: number; base_unit_code?: string; purchase_price?: number }[]
  >(`/api/v1/inventory/items?${qs}`);
  return (res.data ?? []).map((i) => ({
    id: i.id,
    label: `${i.item_code} — ${i.item_name}`,
    meta: {
      base_unit_id: i.base_unit_id,
      base_unit_code: i.base_unit_code,
      item_code: i.item_code,
      item_name: i.item_name,
      purchase_price: i.purchase_price,
    },
  }));
}

async function fetchLocations(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; location_name: string }[]>(`/api/v1/inventory/locations?${qs}`);
  return (res.data ?? []).map((l) => ({ id: l.id, label: l.location_name }));
}

function emptyLine(): BomLine {
  return {
    line_no: 1,
    component_item_id: 0,
    qty: 1,
    scrap_input: "",
    unit_id: null,
    unit_cost: 0,
    line_total: 0,
    output_classification: "finished",
  };
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
  const [directLaborCost, setDirectLaborCost] = createSignal("0");
  const [inboundFreightCost, setInboundFreightCost] = createSignal("0");
  const [additionalCostType, setAdditionalCostType] = createSignal("");
  const [advancedOpen, setAdvancedOpen] = createSignal(false);
  const [fieldErrors, setFieldErrors] = createSignal<FormErrors>({});
  const [notes, setNotes] = createSignal("");
  const [lines, setLines] = createSignal<BomLine[]>([emptyLine()]);
  const [lineLabels, setLineLabels] = createSignal<Record<number, string>>({});
  const [lineUnitLabels, setLineUnitLabels] = createSignal<Record<number, string>>({});
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const client = useQueryClient();

  const isAssemblyLike = () => mode === "assembly" || mode === "recipe" || mode === "all";
  const isCutting = () => mode === "disassembly";
  const showScrapColumn = () => copy.showScrap && (!isAssemblyLike() || advancedOpen() || mode === "recipe");
  // Keep legacy name used in JSX
  const isAssembly = isAssemblyLike;

  const costEstimates = createMemo(() => {
    const materials = lines().reduce((sum, ln) => {
      if (!(ln.component_item_id > 0) || !(Number(ln.qty) > 0)) return sum;
      return sum + lineTotalDisplay(ln);
    }, 0);
    const labor = parseQtyInput(directLaborCost());
    const freight = parseQtyInput(inboundFreightCost());
    const additional = labor + freight;
    return { materials, additional, total: materials + additional };
  });

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
    qs.set("bom_type", mode === "all" ? "assembly" : mode);
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

  const resetCostFields = () => {
    setDirectLaborCost("0");
    setInboundFreightCost("0");
    setAdditionalCostType("");
    setAdvancedOpen(false);
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
    resetCostFields();
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
      mfgWarn(res.message, "Could not load this recipe.");
      return;
    }
    const detail = res.data;
    const detailType =
      detail.bom_type === "disassembly" ? "disassembly" : detail.bom_type === "recipe" ? "recipe" : "assembly";
    if (detailType !== mode && mode !== "all") {
      const label =
        detailType === "disassembly" ? "Cutting" : detailType === "recipe" ? "Recipe / Processing" : "Assembly";
      mfgWarn(null, `This recipe is for ${label}. Opening in the correct section.`);
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
    setDirectLaborCost(String(detail.direct_labor_cost ?? 0));
    setInboundFreightCost(String(detail.inbound_freight_cost ?? 0));
    setAdditionalCostType(detail.additional_cost_type ?? "");
    setAdvancedOpen(false);
    setFieldErrors({});
    setNotes(detail.notes ?? "");
    const loaded = detail.lines?.length ? detail.lines : [emptyLine()];
    setLines(
      loaded.map((ln) => ({
        ...ln,
        scrap_input: ln.scrap_qty != null && ln.scrap_qty !== 0 ? String(ln.scrap_qty) : ln.scrap_input ?? "",
        unit_cost: ln.unit_cost ?? 0,
        line_total: ln.line_total ?? (ln.unit_cost ?? 0) * Number(ln.qty || 0),
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
      direct_labor_cost: directLaborCost(),
      inbound_freight_cost: inboundFreightCost(),
      additional_cost_type: additionalCostType(),
      bom_type: mode === "all" ? "assembly" : mode,
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
      setDirectLaborCost(payload.direct_labor_cost ?? "0");
      setInboundFreightCost(payload.inbound_freight_cost ?? "0");
      setAdditionalCostType(payload.additional_cost_type ?? "");
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
    const requiredValues: Record<string, unknown> = {
      bom_name: bomName(),
      finished_item_id: finishedItemId(),
    };
    const requiredFields: { key: string; label: string }[] = [
      { key: "bom_name", label: copy.bomNameLabel },
      { key: "finished_item_id", label: copy.headerItemLabel },
    ];
    if (!isAssembly()) {
      requiredValues.bom_code = bomCode();
      requiredFields.unshift({ key: "bom_code", label: "Recipe code" });
    }
    const errs = collectRequiredFieldErrors(requiredValues, requiredFields);
    const bodyLines = lines()
      .map((ln) => ({
        ...ln,
        component_item_id: Number(ln.component_item_id) || 0,
        qty: Number(ln.qty) || 0,
      }))
      .filter((ln) => ln.component_item_id > 0 && ln.qty > 0)
      .map((ln) => ({
        component_item_id: ln.component_item_id,
        qty: ln.qty,
        unit_id: ln.unit_id || null,
        scrap_qty: copy.showScrap ? lineScrapQty(ln) : 0,
        output_classification: !isAssembly() ? ln.output_classification || "finished" : undefined,
      }));
    if (bodyLines.length === 0) {
      const typedWithoutPick = lines().some((ln, i) => {
        const label = (lineLabels()[i] ?? "").trim();
        return label.length > 0 && !(Number(ln.component_item_id) > 0);
      });
      errs.lines =
        mode === "disassembly"
          ? typedWithoutPick
            ? "Pick each output from the search list (click or press Enter) — typing the name alone is not enough."
            : "Add at least one output piece."
          : typedWithoutPick
            ? "Pick each material from the search list (click or press Enter) — typing the name alone is not enough."
            : "Add at least one raw material line.";
    } else {
      const orphanLabels = lines().some((ln, i) => {
        const label = (lineLabels()[i] ?? "").trim();
        return label.length > 0 && !(Number(ln.component_item_id) > 0);
      });
      if (orphanLabels) {
        errs.lines =
          mode === "disassembly"
            ? "Some output lines were typed but not picked from the list. Click each item (or press Enter) so every line is linked."
            : "Some material lines were typed but not picked from the list. Click each item (or press Enter) so every line is linked.";
      }
    }
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    const ed = editing();
    const payload: Record<string, unknown> = {
      bom_name: bomName().trim(),
      finished_item_id: finishedItemId(),
      default_location_id: locationId() ?? null,
      output_qty: Number(outputQty()) || 1,
      output_unit_id: outputUnitId(),
      yield_pct: Number(yieldPct()) || 100,
      bom_type: mode === "all" ? "assembly" : mode,
      is_active: isActive(),
      notes: notes().trim() || null,
      lines: bodyLines,
    };
    if (isAssemblyLike()) {
      payload.bom_code = ed ? bomCode().trim() : "";
      payload.direct_labor_cost = parseQtyInput(directLaborCost());
      payload.inbound_freight_cost = parseQtyInput(inboundFreightCost());
      payload.additional_cost_type = additionalCostType().trim() || null;
    } else {
      payload.bom_code = bomCode().trim();
    }
    if (isCutting() || mode === "recipe") {
      const minRaw = expectedYieldMin().trim();
      const maxRaw = expectedYieldMax().trim();
      payload.expected_yield_pct_min = minRaw ? Number(minRaw) : null;
      payload.expected_yield_pct_max = maxRaw ? Number(maxRaw) : null;
    }
    setSaving(true);
    const res = await apiFetch<Bom>(
      ed ? `/api/v1/manufacturing/boms/${ed.id}` : "/api/v1/manufacturing/boms",
      { method: ed ? "PATCH" : "POST", body: JSON.stringify(payload) },
      { silent: true },
    );
    setSaving(false);
    const assignedCode = !ed && res.success && res.data?.bom_code ? String(res.data.bom_code) : "";
    const successMsg = ed
      ? "Recipe updated."
      : assignedCode
        ? `Recipe created. Code: ${assignedCode}`
        : "Recipe created.";
    const ok = handleSaveResult(res, toast, successMsg, {
      onFieldErrors: setFieldErrors,
    });
    if (!ok) return;
    if (assignedCode) setBomCode(assignedCode);
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
      mfgWarn(res.message, "Could not deactivate those recipes.");
      return;
    }
    mfgSuccess(`Deactivated ${res.data.updated} recipe(s); ${res.data.skipped} skipped.`);
    setSelectedIds(new Set<number>());
    await invalidate();
  };

  const listEmpty = () => !list.isFetching && (list.data?.total ?? 0) === 0 && !q() && !statusFilter();

  return (
    <>
      <Show when={mode === "recipe" && listEmpty()}>
        <section class="mb-4 rounded-xl border border-orange-200 bg-orange-50/60 p-5">
          <h2 class="text-sm font-semibold text-text-primary">Create a processing recipe</h2>
          <p class="mt-2 text-sm text-text-secondary">
            Pick batch size, ingredients, and yield bands — code is generated on save. Then start Recipe / Processing from
            the hub: Save draft does not move stock; Process &amp; Post moves ingredients and finished goods when stock is
            enough.
          </p>
          <div class="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700"
              onClick={openNew}
            >
              New processing recipe
            </button>
            <A
              href="/app/production"
              class="rounded-lg border border-stroke bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Manufacturing hub
            </A>
            <A
              href="/app/production/orders/new?type=recipe"
              class="rounded-lg border border-stroke bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
            >
              New processing order
            </A>
          </div>
        </section>
      </Show>
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
        onEdit={(row) => void openEdit(row)}
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
        <Show when={!isAssembly()}>
          <Field label="Recipe code *">
            <input class={inputClass} value={bomCode()} onInput={(e) => setBomCode(e.currentTarget.value)} />
          </Field>
        </Show>
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
          label={isAssembly() ? "Warehouse" : "Default production location"}
          value={locationLabel}
          selectedId={locationId}
          onInput={setLocationLabel}
          onSelect={(o) => { setLocationId(o.id); setLocationLabel(o.label); }}
          onClear={() => { setLocationId(null); setLocationLabel(""); }}
          fetchOptions={fetchLocations}
        />
        <Show when={!isAssembly()}>
          <Field label={`${copy.batchQtyLabel} *`}>
            <input class={inputClass} type="text" inputMode="decimal" value={outputQty()} onInput={(e) => setOutputQty(e.currentTarget.value)} />
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
        </Show>
        <div class="col-span-full sm:col-span-2 lg:col-span-3">
          <Field label="Notes">
            <textarea class={inputClass} rows={2} value={notes()} onInput={(e) => setNotes(e.currentTarget.value)} />
          </Field>
        </div>
        <details
          class="col-span-full rounded-lg border border-stroke bg-slate-50/60 p-3"
          open={advancedOpen()}
          onToggle={(e) => setAdvancedOpen(e.currentTarget.open)}
        >
          <summary class="cursor-pointer text-sm font-medium text-text-primary">
            Advanced (optional)
          </summary>
          <p class="mt-1 text-xs text-text-secondary">
            Most users can leave these alone. Yield % defaults to 100 (no loss).
            <Show when={isAssembly()}>{" "}Extra / spare on parts appears when this section is open.</Show>
          </p>
          <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Show when={isAssembly() && editing()}>
              <Field label="Recipe code" description="Assigned automatically on create.">
                <input class={inputClass} value={bomCode()} readOnly aria-readonly="true" />
              </Field>
            </Show>
            <Show when={isAssembly()}>
              <Field label={copy.batchQtyLabel}>
                <input class={inputClass} type="text" inputMode="decimal" value={outputQty()} onInput={(e) => setOutputQty(e.currentTarget.value)} />
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
            </Show>
            <Field label={copy.yieldLabel} description={copy.yieldDescription}>
              <input class={inputClass} type="text" inputMode="decimal" value={yieldPct()} onInput={(e) => setYieldPct(e.currentTarget.value)} />
            </Field>
            <Show when={isAssembly()}>
              <Field label="Additional cost type" description="Optional. Leave blank unless you track purchase-cost rollups.">
                <select
                  class={inputClass}
                  value={additionalCostType()}
                  onChange={(e) => setAdditionalCostType(e.currentTarget.value)}
                  aria-label="Additional cost type"
                >
                  <option value="">None</option>
                  <option value="bom_purchase_cost">BOM purchase cost</option>
                </select>
              </Field>
            </Show>
            <Show when={isCutting() || mode === "recipe"}>
              <Field label={copy.expectedYieldMinLabel} description={copy.expectedYieldMinDescription}>
                <input class={inputClass} type="text" inputMode="decimal" value={expectedYieldMin()} onInput={(e) => setExpectedYieldMin(e.currentTarget.value)} />
              </Field>
              <Field label={copy.expectedYieldMaxLabel} description={copy.expectedYieldMaxDescription}>
                <input class={inputClass} type="text" inputMode="decimal" value={expectedYieldMax()} onInput={(e) => setExpectedYieldMax(e.currentTarget.value)} />
              </Field>
            </Show>
          </div>
        </details>
        <Show when={isCutting()}>
          <p class="col-span-full text-xs text-text-secondary">
            Tip: turn on lot tracking for parts if you want lot numbers when you record them. Plain qty parts still work.
          </p>
        </Show>
        <div class="col-span-full space-y-2">
          <p class="text-sm font-medium text-text-primary">{copy.lineSectionTitle}</p>
          <For each={lines()}>
            {(ln, idx) => {
              const preview = () => liveStockPreview(ln, conversions() ?? []);
              return (
                <div
                  class={`grid grid-cols-1 items-end gap-2 rounded border border-stroke p-2 ${
                    isAssembly()
                      ? showScrapColumn()
                        ? "sm:grid-cols-[4.5rem_minmax(0,1.1fr)_4.5rem_minmax(7rem,0.75fr)_5rem_5rem_5.5rem_auto]"
                        : "sm:grid-cols-[4.5rem_minmax(0,1.1fr)_4.5rem_minmax(7rem,0.75fr)_5rem_5rem_auto]"
                      : showScrapColumn()
                        ? "sm:grid-cols-[minmax(0,1.1fr)_4.5rem_minmax(8rem,0.85fr)_7rem_5.5rem_auto]"
                        : "sm:grid-cols-[minmax(0,1.1fr)_4.5rem_minmax(8rem,0.85fr)_7rem_auto]"
                  }`}
                >
                  <Show when={isAssembly()}>
                    <label class="text-sm">
                      <span class="text-text-secondary">Part no</span>
                      <input
                        class={`${inputClass} mt-1`}
                        value={ln.component_code ?? ""}
                        readOnly
                        aria-readonly="true"
                        aria-label={`Part number line ${idx() + 1}`}
                        tabindex={0}
                      />
                    </label>
                  </Show>
                  <LookupCombo
                    label={`Line ${idx() + 1}`}
                    required
                    value={() => lineLabels()[idx()] ?? ""}
                    selectedId={() => ln.component_item_id || null}
                    onInput={(v) => setLineLabels((p) => ({ ...p, [idx()]: v }))}
                    onSelect={(o) => {
                      const meta = o.meta as {
                        base_unit_id?: number;
                        base_unit_code?: string;
                        item_code?: string;
                        item_name?: string;
                        purchase_price?: number;
                      } | undefined;
                      const purchase = Number(meta?.purchase_price);
                      const unitCost = Number.isFinite(purchase) && purchase > 0 ? purchase : 0;
                      setLines((prev) =>
                        prev.map((row, i) =>
                          i === idx()
                            ? {
                                ...row,
                                component_item_id: o.id,
                                component_code: meta?.item_code ?? row.component_code,
                                component_name: meta?.item_name ?? row.component_name,
                                unit_id: meta?.base_unit_id ?? row.unit_id,
                                unit_code: meta?.base_unit_code,
                                base_unit_id: meta?.base_unit_id,
                                base_unit_code: meta?.base_unit_code,
                                unit_cost: unitCost,
                                line_total: unitCost * Number(row.qty || 0),
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
                      // Keep typed label; Clear button clears text via onInput("").
                      setLines((prev) =>
                        prev.map((row, i) =>
                          i === idx()
                            ? { ...row, component_item_id: 0, unit_cost: 0, line_total: 0 }
                            : row,
                        ),
                      );
                    }}
                    fetchOptions={fetchItems}
                  />
                  <label class="text-sm">
                    <span class="text-text-secondary">{copy.lineQtyLabel}</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      class={`${inputClass} mt-1`}
                      value={ln.qty === 0 ? "" : String(ln.qty)}
                      onInput={(e) => {
                        const raw = e.currentTarget.value.trim();
                        const v = raw === "" ? 0 : Number(raw);
                        setLines((prev) =>
                          prev.map((row, i) => {
                            if (i !== idx()) return row;
                            const qty = Number.isFinite(v) ? v : row.qty;
                            const unitCost = lineUnitCost(row);
                            return { ...row, qty, line_total: unitCost * qty };
                          }),
                        );
                      }}
                    />
                  </label>
                  <Show when={!isAssembly()}>
                    <label class="text-sm">
                      <span class="text-text-secondary">Class</span>
                      <select
                        class={`${inputClass} mt-1`}
                        value={ln.output_classification || "finished"}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((row, i) =>
                              i === idx() ? { ...row, output_classification: e.currentTarget.value } : row,
                            ),
                          )
                        }
                        aria-label={`Output classification line ${idx() + 1}`}
                      >
                        <option value="finished">Finished</option>
                        <option value="byproduct">By-product</option>
                        <option value="rework">Rework</option>
                        <option value="waste">Waste</option>
                      </select>
                    </label>
                  </Show>
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
                  <Show when={isAssembly()}>
                    <label class="text-sm">
                      <span class="text-text-secondary">Unit cost</span>
                      <input
                        class={`${inputClass} mt-1`}
                        value={formatCost(lineUnitCost(ln))}
                        readOnly
                        aria-readonly="true"
                        aria-label={`Unit cost line ${idx() + 1}`}
                        tabindex={0}
                      />
                    </label>
                    <label class="text-sm">
                      <span class="text-text-secondary">Line total</span>
                      <input
                        class={`${inputClass} mt-1`}
                        value={formatCost(lineTotalDisplay(ln))}
                        readOnly
                        aria-readonly="true"
                        aria-label={`Line total line ${idx() + 1}`}
                        tabindex={0}
                      />
                    </label>
                  </Show>
                  <Show when={showScrapColumn()}>
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
          <p class="text-xs text-text-secondary">
            {isAssembly()
              ? "Costs are estimates from purchase price; open Advanced for spare qty and batch settings."
              : copy.stockHint}
          </p>
        </div>
        <Show when={isAssembly()}>
          <div class="col-span-full grid gap-3 rounded-lg border border-stroke bg-white p-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Direct labor">
              <input
                class={inputClass}
                type="text"
                inputMode="decimal"
                value={directLaborCost()}
                onInput={(e) => setDirectLaborCost(e.currentTarget.value)}
                aria-label="Direct labor cost"
              />
            </Field>
            <Field label="Inbound freight">
              <input
                class={inputClass}
                type="text"
                inputMode="decimal"
                value={inboundFreightCost()}
                onInput={(e) => setInboundFreightCost(e.currentTarget.value)}
                aria-label="Inbound freight cost"
              />
            </Field>
            <div class="sm:col-span-2 lg:col-span-2 flex flex-wrap items-end gap-x-6 gap-y-1 pb-1 text-sm">
              <span class="text-text-secondary">
                Subtotal <span class="font-medium text-text-primary">{formatCost(costEstimates().materials)}</span>
              </span>
              <span class="text-text-secondary">
                Additional <span class="font-medium text-text-primary">{formatCost(costEstimates().additional)}</span>
              </span>
              <span class="text-text-secondary">
                Total <span class="font-medium text-text-primary">{formatCost(costEstimates().total)}</span>
              </span>
            </div>
          </div>
        </Show>
      </EntityModal>
    </>
  );
}
