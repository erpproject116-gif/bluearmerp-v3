import { createSignal, For, Show, createEffect } from "solid-js";
import { A, useSearchParams } from "@solidjs/router";
import { apiFetch } from "../../shared/api";
import { LookupCombo, type LookupOption } from "../../shared/LookupCombo";
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
import { jobsHref, type MfgMode } from "../production/mfgProductionMode";
import { mfgSuccess, mfgWarn } from "../production/mfgToast";
import { CompleteWorkOrderModal } from "./CompleteWorkOrderModal";
import {
  WoSalesOrderLinePickerModal,
  type PickedWoSalesOrderLine,
} from "./WoSalesOrderLinePickerModal";

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
  inspection_status?: string;
  order_date: string;
  notes?: string | null;
  bom_type?: string;
  finished_track_serial?: boolean;
  finished_track_lot?: boolean;
  components_tracked?: boolean;
};

function needsTakeFromStock(r: WorkOrder): boolean {
  if (r.bom_type === "disassembly") {
    return Boolean(r.finished_track_serial || r.finished_track_lot);
  }
  return Boolean(r.components_tracked);
}

function needsRecordFinished(r: WorkOrder): boolean {
  if (r.bom_type === "disassembly") return false;
  return Boolean(r.finished_track_serial || r.finished_track_lot);
}

function qcBlocked(r: WorkOrder): boolean {
  return r.inspection_status === "pending" || r.inspection_status === "held";
}

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
  bom_type?: string;
  qty_to_produce: number;
  finished_base_unit_code: string;
  output_qty: number;
  yield_pct: number;
  receive_qty: number;
  input_line?: MaterialNeedLine;
  lines: MaterialNeedLine[];
};

function makeFetchBoms(mode: MfgMode) {
  return async (q: string): Promise<LookupOption[]> => {
    const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active", bom_type: mode });
    if (q) qs.set("q", q);
    const res = await apiFetch<BomOption[]>(`/api/v1/manufacturing/boms?${qs}`);
    return (res.data ?? []).map((b) => ({ id: b.id, label: `${b.bom_code} — ${b.bom_name}` }));
  };
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
  { value: "released", label: "In production" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export default function WorkOrdersPage() {
  const { mode, copy } = useProductionMode();
  const auth = useAuth();
  const [searchParams] = useSearchParams();
  const canRelease = () => hasPermission(auth.me, "manufacturing.work_orders_release", "write");
  const canBulkWo = () => hasPermission(auth.me, "manufacturing.work_orders_bulk", "write");
  const canComplete = () => hasPermission(auth.me, "manufacturing.work_orders_complete", "write");
  const canInspect = () => hasPermission(auth.me, "quality.wo_inspection", "write");
  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } =
    useListState("order_date", 25, { defaultOrder: "desc", defaultStatus: "" });

  createEffect(() => {
    const st = String(searchParams.status ?? "").trim().toLowerCase();
    if (st && ["draft", "released", "completed", "cancelled"].includes(st) && statusFilter() !== st) {
      setStatusFilter(st);
    }
  });

  const setStatusAndUrl = (st: string) => {
    setStatusFilter(st);
    const url = new URL(window.location.href);
    if (st) url.searchParams.set("status", st);
    else url.searchParams.delete("status");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  };
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [selectedIds, setSelectedIds] = createSignal<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = createSignal(false);
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
  const [soPickerOpen, setSoPickerOpen] = createSignal(false);
  const [loadSlipBusy, setLoadSlipBusy] = createSignal(false);
  const [inspectingId, setInspectingId] = createSignal<number | null>(null);
  const [completeTarget, setCompleteTarget] = createSignal<WorkOrder | null>(null);
  const [fieldErrors, setFieldErrors] = createSignal<FormErrors>({});
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
    qs.set("bom_type", mode);
    return {
      queryKey: ["mfg-work-orders", mode, page(), pageSize, sort(), order(), q(), statusFilter()],
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
    if (editing() && editing()!.status !== "draft") {
      toast.warning("Only draft jobs can be edited.");
      return;
    }
    const errs = editing()
      ? collectRequiredFieldErrors({ qty_to_produce: qty() }, [{ key: "qty_to_produce", label: copy.jobQtyLabel }])
      : collectRequiredFieldErrors(
          { bom_id: bomId(), qty_to_produce: qty() },
          [
            { key: "bom_id", label: "Recipe" },
            { key: "qty_to_produce", label: copy.jobQtyLabel },
          ],
        );
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
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
    const ok = handleSaveResult(res, toast, ed ? "Job updated." : "Job created.", { onFieldErrors: setFieldErrors });
    if (!ok) return;
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
      mfgWarn(res.message, "Couldn’t start this job. Try again.");
      return;
    }
    mfgSuccess("Job started. Follow the steps on this row.");
    invalidate();
  };

  const patchInspection = async (row: WorkOrder, status: "held" | "released") => {
    if (row.status !== "released") return;
    setInspectingId(row.id);
    const res = await apiFetch(`/api/v1/quality/work-orders/${row.id}/inspection`, {
      method: "PATCH",
      body: JSON.stringify({ inspection_status: status }),
    });
    setInspectingId(null);
    if (!res.success) {
      mfgWarn(res.message, "Couldn’t update the quality check. Try again.");
      return;
    }
    mfgSuccess(
      status === "released"
        ? "Quality check passed. You can Finish now."
        : "Job held for quality check.",
    );
    invalidate();
  };

  const applySalesOrderLines = async (picked: PickedWoSalesOrderLine[]) => {
    if (picked.length === 0) return;
    const soIds = [...new Set(picked.map((l) => l.sales_order_id))];
    setLoadSlipBusy(true);
    let ok = 0;
    let lastWo: WorkOrder | null = null;
    for (const soId of soIds) {
      const res = await apiFetch<WorkOrder>(`/api/v1/manufacturing/work-orders/from-sales-order/${soId}`, {
        method: "POST",
      });
      if (res.success) {
        ok++;
        if (res.data) lastWo = res.data;
        continue;
      }
      const detail = res.errors ? Object.values(res.errors).filter(Boolean).join(" ") : "";
      mfgWarn(detail || res.message, "Couldn’t create a job from that sales order.");
    }
    setLoadSlipBusy(false);
    if (ok > 0) {
      const woLabel = lastWo?.work_order_no ? ` (${lastWo.work_order_no})` : "";
      mfgSuccess(`Created ${ok} job(s) from sales order(s)${woLabel}.`);
      // Show the tab that matches the WO we got back (draft by default).
      const st = (lastWo?.status || "draft").trim().toLowerCase();
      if (["draft", "released", "completed", "cancelled"].includes(st)) {
        setStatusAndUrl(st);
      } else {
        setStatusAndUrl("");
      }
      if (lastWo?.id) setSelectedId(lastWo.id);
      invalidate();
    }
  };


  const bulkCancelDrafts = async () => {
    const ids = [...selectedIds()];
    if (ids.length === 0 || !canBulkWo()) return;
    if (!window.confirm(`Cancel ${ids.length} selected draft job(s)?`)) return;
    setBulkBusy(true);
    const res = await apiFetch<{ updated: number; skipped: number }>(
      "/api/v1/manufacturing/work-orders/actions/bulk-cancel",
      { method: "POST", body: JSON.stringify({ ids }) },
      { silent: true },
    );
    setBulkBusy(false);
    if (!res.success || !res.data) {
      mfgWarn(res.message, "Couldn’t cancel those jobs.");
      return;
    }
    mfgSuccess(`Cancelled ${res.data.updated} job(s); ${res.data.skipped} skipped.`);
    setSelectedIds(new Set<number>());
    invalidate();
  };

  const bulkReleaseDrafts = async () => {
    const ids = [...selectedIds()];
    if (ids.length === 0 || !canBulkWo()) return;
    if (!window.confirm(`Start ${ids.length} selected draft job(s)?`)) return;
    setBulkBusy(true);
    const res = await apiFetch<{ updated: number; skipped: number }>(
      "/api/v1/manufacturing/work-orders/actions/bulk-release",
      { method: "POST", body: JSON.stringify({ ids }) },
      { silent: true },
    );
    setBulkBusy(false);
    if (!res.success || !res.data) {
      mfgWarn(res.message, "Couldn’t start those jobs.");
      return;
    }
    mfgSuccess(`Started ${res.data.updated} job(s); ${res.data.skipped} skipped.`);
    setSelectedIds(new Set<number>());
    invalidate();
  };

  const stationQuery = (woId: number) => `?woId=${woId}&mode=${mode}`;

  const woType = (r: WorkOrder) => (r.bom_type === "disassembly" ? "disassembly" : "assembly") as MfgMode;

  return (
    <>
      <p class="mb-3 text-sm text-text-secondary">
        <span class="font-medium text-text-primary">{copy.jobTitle}:</span>{" "}
        Start a job → take stock if needed → record results → finish. Stock updates when you finish.
      </p>
      <SpreadsheetGrid<WorkOrder>
        columns={[
          { key: "work_order_no", header: "Job no.", clickable: true },
          { key: "order_date", header: "Date" },
          { key: "bom_code", header: "Recipe" },
          { key: "finished_item_name", header: copy.headerItemLabel },
          { key: "location_name", header: "Location" },
          {
            key: "qty_to_produce",
            header: "Qty",
            render: (r) => `${r.qty_to_produce}${r.finished_base_unit_code ? ` ${r.finished_base_unit_code}` : ""}`,
          },
          {
            key: "inspection_status",
            header: "Quality check",
            sortable: false,
            render: (r) => (
              <div class="flex flex-wrap items-center gap-2 capitalize">
                <span>{(r.inspection_status ?? "released").replace(/_/g, " ")}</span>
                <Show when={r.status === "released" && qcBlocked(r)}>
                  <span class="text-xs text-amber-700">Pass quality check before Finish</span>
                </Show>
                <Show when={r.status === "released" && canInspect()}>
                  <button
                    type="button"
                    class="text-xs text-brand-600 hover:underline disabled:opacity-50"
                    disabled={inspectingId() === r.id}
                    onClick={(e) => { e.stopPropagation(); void patchInspection(r, "released"); }}
                  >
                    Pass quality check
                  </button>
                  <button
                    type="button"
                    class="text-xs text-amber-700 hover:underline disabled:opacity-50"
                    disabled={inspectingId() === r.id}
                    onClick={(e) => { e.stopPropagation(); void patchInspection(r, "held"); }}
                  >
                    Hold
                  </button>
                </Show>
              </div>
            ),
          },
          {
            key: "status",
            header: "Status / actions",
            sortable: false,
            render: (r) => (
              <div class="flex flex-wrap items-center gap-2 capitalize">
                <span>{r.status.replace(/_/g, " ")}</span>
                <Show when={r.status === "draft" && canRelease()}>
                  <button
                    type="button"
                    class="rounded border border-brand-300 bg-brand-50 px-1.5 py-0.5 text-xs font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50"
                    disabled={actionId() === r.id}
                    onClick={(e) => { e.stopPropagation(); void release(r); }}
                  >
                    Start job
                  </button>
                </Show>
                <Show when={r.status === "released"}>
                  <span class="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">Steps</span>
                  <Show when={woType(r) === "assembly"}>
                    <Show when={needsTakeFromStock(r)}>
                      <A
                        href={`/app/production/issue-station${stationQuery(r.id)}`}
                        class="text-xs font-medium text-brand-600 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        1. Take materials
                      </A>
                    </Show>
                    <Show when={needsRecordFinished(r)}>
                      <A
                        href={`/app/production/receive-station${stationQuery(r.id)}`}
                        class="text-xs font-medium text-brand-600 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        2. Record finished
                      </A>
                    </Show>
                    <Show when={!needsTakeFromStock(r) && !needsRecordFinished(r)}>
                      <span class="text-[10px] text-text-secondary">No serial/lot tracking — you can finish when ready.</span>
                    </Show>
                  </Show>
                  <Show when={woType(r) === "disassembly"}>
                    <Show when={needsTakeFromStock(r)}>
                      <A
                        href={`/app/production/issue-station${stationQuery(r.id)}`}
                        class="text-xs font-medium text-brand-600 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        1. Take from stock
                      </A>
                    </Show>
                    <A
                      href={`/app/production/weigh-parts${stationQuery(r.id)}`}
                      class="text-xs font-medium text-brand-600 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {needsTakeFromStock(r) ? "2. Record parts" : "1. Record parts"}
                    </A>
                    <Show when={!needsTakeFromStock(r)}>
                      <span class="text-[10px] text-text-secondary">No serial/lot on whole — skip take from stock.</span>
                    </Show>
                  </Show>
                </Show>
                <Show when={r.status === "released" && canComplete()}>
                  <button
                    type="button"
                    class="rounded border border-brand-300 bg-brand-50 px-1.5 py-0.5 text-xs font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50"
                    disabled={actionId() === r.id || qcBlocked(r)}
                    title={
                      qcBlocked(r)
                        ? "Quality check still open — mark it Passed, then Finish."
                        : undefined
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      if (qcBlocked(r)) {
                        mfgWarn(null, "Quality check still open — mark it Passed, then Finish.");
                        return;
                      }
                      setCompleteTarget(r);
                    }}
                  >
                    {woType(r) === "disassembly"
                      ? (needsTakeFromStock(r) ? "3. Finish" : "2. Finish")
                      : "3. Finish"}
                  </button>
                </Show>
                <Show when={r.status === "completed"}>
                  <A
                    href="/app/inventory/serial-lot/pack-station"
                    class="rounded border border-brand-300 bg-brand-50 px-1.5 py-0.5 text-xs font-medium text-brand-700 hover:bg-brand-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Next: Pack
                  </A>
                </Show>
              </div>
            ),
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
        settingsHref={jobsHref(mode)}
        toolbarExtra={
          <>
            <Show when={canBulkWo()}>
              <button
                type="button"
                class="rounded-lg border border-stroke px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                disabled={selectedIds().size === 0 || bulkBusy()}
                onClick={() => void bulkCancelDrafts()}
              >
                Cancel drafts{selectedIds().size > 0 ? ` (${selectedIds().size})` : ""}
              </button>
              <Show when={canRelease()}>
                <button
                  type="button"
                  class="rounded-lg border border-stroke px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
                  disabled={selectedIds().size === 0 || bulkBusy()}
                  onClick={() => void bulkReleaseDrafts()}
                >
                  Start selected{selectedIds().size > 0 ? ` (${selectedIds().size})` : ""}
                </button>
              </Show>
            </Show>
            <Show when={mode === "assembly"}>
              <button
                type="button"
                class="rounded-lg border border-stroke px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                disabled={loadSlipBusy()}
                onClick={() => setSoPickerOpen(true)}
                title="Create Assembly jobs from a sales order"
              >
                {loadSlipBusy() ? "Loading…" : "From customer order…"}
              </button>
            </Show>
          </>
        }
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
        searchPlaceholder="Search job, recipe, item…"
        status={statusFilter()}
        onStatusChange={setStatusAndUrl}
        statusLabel="Status"
        statusOptions={STATUS_TABS}
        onRefresh={invalidate}
      />

      <EntityModal
        open={modalOpen()}
        title={editing() ? `Job ${editing()!.work_order_no}` : copy.newJobTitle}
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
        <FormErrorSummary errors={fieldErrors} />
        <ModalFormGuide guideId={copy.jobGuideId} spanFull />
        <LookupCombo
          label="Recipe"
          required
          value={bomLabel}
          selectedId={bomId}
          onInput={setBomLabel}
          onSelect={(o) => { setBomId(o.id); setBomLabel(o.label); }}
          onClear={() => { setBomId(null); setBomLabel(""); }}
          fetchOptions={makeFetchBoms(mode)}
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
        <Field label={`${copy.jobQtyLabel} *${finishedUnit() ? ` (${finishedUnit()})` : ""}`}>
          <input
            class={inputClass}
            type="text"
            inputMode="decimal"
            value={qty()}
            disabled={!!editing() && editing()!.status !== "draft"}
            onInput={(e) => setQty(e.currentTarget.value)}
          />
        </Field>

        <Show when={materials()}>
          {(m) => (
            <div class="mt-4 space-y-2">
              <Show when={m().input_line}>
                {(input) => (
                  <div class="rounded border border-stroke p-2 text-xs">
                    <p class="font-medium text-text-primary">{copy.materialsInputLabel}</p>
                    <p>
                      {input().component_code}: {input().stock_to_issue.toFixed(4)} {input().stock_unit_code}
                    </p>
                  </div>
                )}
              </Show>
              <p class="text-sm font-medium text-text-primary">
                {mode === "disassembly" ? copy.materialsOutputLabel : "Materials needed"}
              </p>
              <p class="text-xs text-text-secondary">
                {mode === "disassembly"
                  ? `Batch ${m().output_qty} · yield ${m().yield_pct}%`
                  : `Will receive ${m().receive_qty} ${m().finished_base_unit_code || finishedUnit()} · batch ${m().output_qty} · yield ${m().yield_pct}%`}
              </p>
              <div class="overflow-x-auto rounded border border-stroke">
                <table class="min-w-full text-left text-xs">
                  <thead class="bg-slate-50 text-text-secondary">
                    <tr>
                      <th class="px-2 py-1.5">Item</th>
                      <th class="px-2 py-1.5">Recipe qty</th>
                      <Show when={mode === "assembly"}>
                        <th class="px-2 py-1.5">Scrap/spare</th>
                      </Show>
                      <th class="px-2 py-1.5">{mode === "disassembly" ? "Expected" : "To issue"}</th>
                      <th class="px-2 py-1.5">On hand</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={m().lines}>
                      {(ln) => (
                        <tr class={ln.shortage > 0 ? "bg-red-50 text-red-800" : ""}>
                          <td class="px-2 py-1.5">{ln.component_code} — {ln.component_name}</td>
                          <td class="px-2 py-1.5">{ln.bom_qty} {ln.bom_unit_code}</td>
                          <Show when={mode === "assembly"}>
                            <td class="px-2 py-1.5">{ln.scrap_qty} {ln.bom_unit_code}</td>
                          </Show>
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
      <CompleteWorkOrderModal
        open={!!completeTarget()}
        workOrder={completeTarget()}
        mode={mode}
        onClose={() => setCompleteTarget(null)}
        onCompleted={() => invalidate()}
      />
      <WoSalesOrderLinePickerModal
        open={soPickerOpen()}
        onClose={() => setSoPickerOpen(false)}
        onConfirm={(picked) => void applySalesOrderLines(picked)}
      />
    </>
  );
}
