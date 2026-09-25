import { createSignal, For, Show, createEffect, createMemo } from "solid-js";
import { A, useSearchParams } from "@solidjs/router";
import { apiFetch } from "../../shared/api";
import { LookupCombo, type LookupOption } from "../../shared/LookupCombo";
import { EntityModal, Field, SpreadsheetGrid, inputClass, type Column } from "../../shared/SpreadsheetGrid";
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
import { useProcessPolicy } from "../../shared/useProcessPolicy";
import { useProductionMode } from "../production/ProductionModeLayout";
import { newAssemblyOrderHref, newCuttingOrderHref, newRecipeOrderHref, bomTypeForMode, type MfgMode } from "../production/mfgProductionMode";
import { mfgSuccess, mfgWarn } from "../production/mfgToast";
import { CompleteWorkOrderModal } from "./CompleteWorkOrderModal";
import {
  WoSalesOrderLinePickerModal,
  type PickedWoSalesOrderLine,
} from "./WoSalesOrderLinePickerModal";
import { ActivityHistoryLink } from "../../shared/ActivityHistoryLink";
import { RecordHistoryButton } from "../../shared/RecordHistoryButton";
import { InvBookLedgerModal, type InvBookLedgerTarget } from "../inventory/reports/InvBookLedgerModal";

type WorkOrder = {
  id: number;
  work_order_no: string;
  bom_id?: number;
  bom_code?: string;
  bom_name?: string;
  finished_item_id?: number;
  finished_item_code?: string;
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
  source_sales_order_id?: number | null;
  source_sales_order_no?: string | null;
  created_at?: string | null;
  released_at?: string | null;
  completed_at?: string | null;
  reversed_at?: string | null;
  transacted_at?: string | null;
  actual_input_qty?: number | null;
  waste_lines?: WorkOrderWasteView[];
  output_actuals?: WorkOrderOutputActual[];
};

type WorkOrderWasteView = {
  component_item_id?: number | null;
  component_code?: string;
  component_name?: string;
  classification: string;
  qty: number;
  expected_qty: number;
  difference: number;
  waste_reason_code?: string;
  waste_reason_name?: string;
};

type WorkOrderOutputActual = {
  component_item_id: number;
  qty: number;
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

function woTransactedAt(r: WorkOrder): string {
  return r.transacted_at || r.completed_at || r.released_at || r.created_at || "";
}

function formatLocalDateTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
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

const DISASSEMBLY_STATUS_TABS = [
  { value: "", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "released", label: "In production" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const ASSEMBLY_STATUS_TABS = [
  { value: "open", label: "Open" },
  { value: "completed", label: "Done" },
  { value: "", label: "All" },
];

export default function WorkOrdersPage() {
  const { mode, copy } = useProductionMode();
  const isAssembly = () => mode() === "assembly" || mode() === "recipe" || mode() === "all";
  const auth = useAuth();
  const [searchParams] = useSearchParams();
  const canRelease = () => hasPermission(auth.me, "manufacturing.work_orders_release", "write");
  const canBulkWo = () => hasPermission(auth.me, "manufacturing.work_orders_bulk", "write");
  const canComplete = () => hasPermission(auth.me, "manufacturing.work_orders_complete", "write");
  const canInspect = () => hasPermission(auth.me, "quality.wo_inspection", "write");
  const processPolicy = useProcessPolicy(() => mode() === "assembly" || mode() === "recipe");
  const requireFgQc = () => Boolean(processPolicy.data?.manufacturing_require_fg_qc);

  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize, setPageSize } =
    useListState(isAssembly() ? "transacted_at" : "order_date", 25, {
      defaultOrder: "desc",
      defaultStatus: isAssembly() ? "open" : "",
    });

  createEffect(() => {
    const rawQ = String(searchParams.q ?? "").trim();
    if (rawQ && q() !== rawQ) setQ(rawQ);
    const st = String(searchParams.status ?? "").trim().toLowerCase();
    if (isAssembly()) {
      if (rawQ && !st && statusFilter() === "open") {
        setStatusFilter("");
        return;
      }
      const allowed = ["open", "completed", "cancelled", "draft", "released", ""];
      if (st && allowed.includes(st) && statusFilter() !== st) {
        setStatusFilter(st);
      }
      return;
    }
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
  const [ledgerRow, setLedgerRow] = createSignal<InvBookLedgerTarget | null>(null);
  const openItemBook = (item: InvBookLedgerTarget) => setLedgerRow(item);
  const [soPickerOpen, setSoPickerOpen] = createSignal(false);
  const [loadSlipBusy, setLoadSlipBusy] = createSignal(false);
  const [inspectingId, setInspectingId] = createSignal<number | null>(null);
  const [completeTarget, setCompleteTarget] = createSignal<WorkOrder | null>(null);
  const [fieldErrors, setFieldErrors] = createSignal<FormErrors>({});
  const toast = useToast();
  const client = useQueryClient();

  const list = createQuery(() => {
    const apiStatus = statusFilter() === "open" ? "" : statusFilter();
    const qs = new URLSearchParams({
      page: String(page()),
      pageSize: String(pageSize()),
      sort: sort(),
      order: order(),
    });
    if (q()) qs.set("q", q());
    if (apiStatus) qs.set("status", apiStatus);
    const bomType = bomTypeForMode(mode());
    if (bomType) qs.set("bom_type", bomType);
    return {
      queryKey: ["mfg-work-orders", mode(), page(), pageSize(), sort(), order(), q(), statusFilter()],
      queryFn: async () => {
        const res = await apiFetch<WorkOrder[]>(`/api/v1/manufacturing/work-orders?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load");
        let rows = res.data ?? [];
        if (statusFilter() === "open") {
          rows = rows.filter((r) => r.status === "draft" || r.status === "released");
        }
        return { rows, total: res.meta?.total ?? 0 };
      },
    };
  });

  const invalidate = () => void client.invalidateQueries({ queryKey: ["mfg-work-orders"] });

  createEffect(() => {
    const rawQ = String(searchParams.q ?? "").trim();
    const rows = list.data?.rows ?? [];
    if (!rawQ || rows.length !== 1) return;
    if (selectedId() !== rows[0].id) setSelectedId(rows[0].id);
  });

  const jobTrace = createQuery(() => {
    const id = selectedId();
    return {
      queryKey: ["wo-job-trace", id],
      enabled: id != null,
      queryFn: async () => {
        const [woRes, needsRes] = await Promise.all([
          apiFetch<WorkOrder>(`/api/v1/manufacturing/work-orders/${id}`),
          apiFetch<MaterialNeeds>(`/api/v1/manufacturing/work-orders/${id}/material-needs`),
        ]);
        if (!woRes.success || !woRes.data) throw new Error(woRes.message ?? "Failed to load job");
        return { wo: woRes.data, needs: needsRes.success ? needsRes.data ?? null : null };
      },
    };
  });

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
    if (mode() === "assembly" || mode() === "all") {
      window.location.assign(newAssemblyOrderHref());
      return;
    }
    if (mode() === "recipe") {
      window.location.assign(newRecipeOrderHref());
      return;
    }
    if (mode() === "disassembly") {
      window.location.assign(newCuttingOrderHref());
      return;
    }
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
      ? collectRequiredFieldErrors({ qty_to_produce: qty() }, [{ key: "qty_to_produce", label: copy().jobQtyLabel }])
      : collectRequiredFieldErrors(
          { bom_id: bomId(), qty_to_produce: qty() },
          [
            { key: "bom_id", label: "Recipe" },
            { key: "qty_to_produce", label: copy().jobQtyLabel },
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
    setModalOpen(false);
    setEditing(null);
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

  const revertToDraft = async (row: WorkOrder) => {
    setActionId(row.id);
    const res = await apiFetch(`/api/v1/manufacturing/work-orders/${row.id}/revert-draft`, { method: "POST" }, { silent: true });
    setActionId(null);
    if (!res.success) {
      mfgWarn(res.message, "Couldn’t put this job back to draft. Finish or cancel it instead.");
      return;
    }
    mfgSuccess("Job is draft again — you can edit qty/location.");
    invalidate();
  };

  const reverseCompleted = async (row: WorkOrder) => {
    const reason = window.prompt("Reason for reversing this completed work order?");
    if (!reason?.trim()) return;
    setActionId(row.id);
    const res = await apiFetch(
      `/api/v1/manufacturing/work-orders/${row.id}/reverse`,
      { method: "POST", body: JSON.stringify({ reason: reason.trim() }) },
      { silent: true },
    );
    setActionId(null);
    if (!res.success) {
      mfgWarn(res.message, "Could not reverse this job. Its output may already have been used.");
      return;
    }
    mfgSuccess("Reversal posted. The completed job remains in history.");
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
      if (isAssembly()) {
        setStatusAndUrl("open");
      } else {
        const st = (lastWo?.status || "draft").trim().toLowerCase();
        if (["draft", "released", "completed", "cancelled"].includes(st)) {
          setStatusAndUrl(st);
        } else {
          setStatusAndUrl("");
        }
      }
      if (lastWo?.id) setSelectedId(lastWo.id);
      invalidate();
    }
  };


  const cancelDraft = async (row: WorkOrder) => {
    if (!window.confirm(`Cancel draft job ${row.work_order_no}?`)) return;
    setActionId(row.id);
    const res = await apiFetch<{ updated: number; skipped: number }>(
      "/api/v1/manufacturing/work-orders/actions/bulk-cancel",
      { method: "POST", body: JSON.stringify({ ids: [row.id] }) },
      { silent: true },
    );
    setActionId(null);
    if (!res.success || !res.data || res.data.updated < 1) {
      mfgWarn(res.message, "Couldn’t cancel this job. Only draft jobs can be cancelled.");
      return;
    }
    mfgSuccess("Job cancelled.");
    invalidate();
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

  const stationQuery = (woId: number, r?: WorkOrder) => {
    const m = r ? woType(r) : mode() === "all" ? "assembly" : mode();
    return `?woId=${woId}&mode=${m}`;
  };

  const woType = (r: WorkOrder) =>
    (r.bom_type === "disassembly" ? "disassembly" : r.bom_type === "recipe" ? "recipe" : "assembly") as MfgMode;

  const openFinish = (r: WorkOrder) => {
    if (requireFgQc() && qcBlocked(r)) {
      mfgWarn(null, "Quality check still open — mark it Passed, then Finish build.");
      return;
    }
    setCompleteTarget(r);
  };

  const continueStationHref = (r: WorkOrder): string | null => {
    if (needsTakeFromStock(r)) return `/app/production/issue-station${stationQuery(r.id, r)}`;
    if (needsRecordFinished(r)) return `/app/production/receive-station${stationQuery(r.id, r)}`;
    return null;
  };

  const columns = createMemo((): Column<WorkOrder>[] => {
    if (isAssembly()) {
      const cols: Column<WorkOrder>[] = [
        { key: "work_order_no", header: "Job no.", clickable: true },
        { key: "bom_code", header: "Recipe" },
        {
          key: "finished_item_code",
          header: "Item code",
          clickable: false,
          sortable: false,
          render: (r) =>
            r.finished_item_id && r.finished_item_code ? (
              <button
                type="button"
                class="text-left font-medium text-brand-600 underline-offset-2 hover:text-brand-700 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  openItemBook({
                    item_id: r.finished_item_id!,
                    item_code: r.finished_item_code!,
                    item_name: r.finished_item_name ?? "",
                  });
                }}
              >
                {r.finished_item_code}
              </button>
            ) : (
              "—"
            ),
        },
        { key: "finished_item_name", header: copy().headerItemLabel },
        { key: "location_name", header: "Location" },
        {
          key: "qty_to_produce",
          header: "Planned",
          render: (r) => `${r.qty_to_produce}${r.finished_base_unit_code ? ` ${r.finished_base_unit_code}` : ""}`,
        },
        {
          key: "qty_produced",
          header: "Produced",
          render: (r) =>
            `${r.qty_produced ?? 0}${r.finished_base_unit_code ? ` ${r.finished_base_unit_code}` : ""}`,
        },
        {
          key: "source_sales_order_no",
          header: "Customer order",
          sortable: false,
          render: (r) => {
            const no = r.source_sales_order_no;
            if (!no) return <span class="text-text-secondary">—</span>;
            if (r.source_sales_order_id) {
              return (
                <A
                  href={`/app/sales-order/sales-orders?openId=${r.source_sales_order_id}`}
                  class="font-medium text-brand-600 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {no}
                </A>
              );
            }
            return <span>{no}</span>;
          },
        },
        {
          key: "transacted_at",
          header: "Transacted at",
          render: (r) => formatLocalDateTime(woTransactedAt(r)),
          exportValue: (r) => formatLocalDateTime(woTransactedAt(r)),
        },
      ];
      if (requireFgQc()) {
        cols.push({
          key: "inspection_status",
          header: "Quality check",
          sortable: false,
          render: (r) => (
            <Show when={r.status === "released" && qcBlocked(r)} fallback={<span class="text-text-secondary">—</span>}>
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-xs text-amber-700">Needs quality pass</span>
                <Show when={canInspect()}>
                  <button
                    type="button"
                    class="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50"
                    disabled={inspectingId() === r.id}
                    aria-label="Pass quality check"
                    onClick={(e) => { e.stopPropagation(); void patchInspection(r, "released"); }}
                  >
                    Pass
                  </button>
                  <button
                    type="button"
                    class="text-[11px] text-text-secondary hover:underline disabled:opacity-50"
                    disabled={inspectingId() === r.id}
                    aria-label="Hold for quality"
                    onClick={(e) => { e.stopPropagation(); void patchInspection(r, "held"); }}
                  >
                    Hold
                  </button>
                </Show>
              </div>
            </Show>
          ),
        });
      }
      cols.push({
        key: "status",
        header: "Status / actions",
        sortable: false,
        render: (r) => (
          <div class="flex flex-wrap items-center gap-2">
            <span class="capitalize text-text-secondary">{r.status.replace(/_/g, " ")}</span>
            <Show when={(r.status === "draft" || r.status === "released") && canComplete()}>
              <Show when={r.status === "draft" ? canRelease() : true}>
                <button
                  type="button"
                  class="rounded border border-brand-300 bg-brand-50 px-1.5 py-0.5 text-xs font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50"
                  disabled={
                    actionId() === r.id ||
                    (r.status === "released" && requireFgQc() && qcBlocked(r))
                  }
                  title={
                    r.status === "released" && requireFgQc() && qcBlocked(r)
                      ? "Needs quality pass before Finish build."
                      : undefined
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    openFinish(r);
                  }}
                >
                  Finish build
                </button>
              </Show>
            </Show>
            <Show when={r.status === "released" && continueStationHref(r)}>
              {(href) => (
                <A
                  href={href()}
                  class="text-xs font-medium text-brand-600 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Continue
                </A>
              )}
            </Show>
            <Show
              when={
                r.status === "released" &&
                needsRecordFinished(r) &&
                needsTakeFromStock(r)
              }
            >
              <A
                href={`/app/production/receive-station${stationQuery(r.id, r)}`}
                class="text-xs font-medium text-brand-600 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                Record finished
              </A>
            </Show>
            <Show when={r.status === "draft" && canRelease()}>
              <button
                type="button"
                class="text-[11px] text-text-secondary hover:underline disabled:opacity-50"
                disabled={actionId() === r.id}
                onClick={(e) => { e.stopPropagation(); void release(r); }}
              >
                Start job
              </button>
            </Show>
            <Show when={r.status === "draft"}>
              <button
                type="button"
                class="text-[11px] text-red-700 hover:underline disabled:opacity-50"
                disabled={actionId() === r.id || bulkBusy()}
                onClick={(e) => {
                  e.stopPropagation();
                  void cancelDraft(r);
                }}
              >
                Cancel
              </button>
            </Show>
            <Show when={r.status === "released" && canRelease()}>
              <button
                type="button"
                class="text-[11px] text-text-secondary hover:underline disabled:opacity-50"
                disabled={actionId() === r.id}
                aria-label="Revert job to draft"
                onClick={(e) => { e.stopPropagation(); void revertToDraft(r); }}
              >
                Revert to draft
              </button>
            </Show>
            <Show when={r.status === "completed"}>
              <Show when={!r.reversed_at}>
                <A
                  href="/app/inventory/serial-lot/pack-station"
                  class="rounded border border-brand-300 bg-brand-50 px-1.5 py-0.5 text-xs font-medium text-brand-700 hover:bg-brand-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  Next: Pack
                </A>
              </Show>
              <Show when={!r.reversed_at && canComplete()}>
                <button
                  type="button"
                  class="text-[11px] text-red-700 hover:underline disabled:opacity-50"
                  disabled={actionId() === r.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    void reverseCompleted(r);
                  }}
                >
                  Reverse posting
                </button>
              </Show>
              <Show when={r.reversed_at}>
                <span class="text-[11px] font-medium text-text-secondary">Reversed</span>
              </Show>
            </Show>
            <ActivityHistoryLink
              module="manufacturing"
              targetType="mfg_work_order"
              targetId={r.id}
              title={`History — ${r.work_order_no}`}
            />
          </div>
        ),
      });
      return cols;
    }

    return [
      { key: "work_order_no", header: "Job no.", clickable: true },
      { key: "order_date", header: "Date" },
      { key: "bom_code", header: "Recipe" },
      {
        key: "finished_item_code",
        header: "Item code",
        clickable: false,
        sortable: false,
        render: (r) =>
          r.finished_item_id && r.finished_item_code ? (
            <button
              type="button"
              class="text-left font-medium text-brand-600 underline-offset-2 hover:text-brand-700 hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                openItemBook({
                  item_id: r.finished_item_id!,
                  item_code: r.finished_item_code!,
                  item_name: r.finished_item_name ?? "",
                });
              }}
            >
              {r.finished_item_code}
            </button>
          ) : (
            "—"
          ),
      },
      { key: "finished_item_name", header: copy().headerItemLabel },
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
            <Show when={r.status === "draft"}>
              <button
                type="button"
                class="rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                disabled={actionId() === r.id || bulkBusy()}
                onClick={(e) => {
                  e.stopPropagation();
                  void cancelDraft(r);
                }}
              >
                Cancel
              </button>
            </Show>
            <Show when={r.status === "released"}>
              <span class="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">Steps</span>
              <Show when={woType(r) === "disassembly"}>
                <Show when={needsTakeFromStock(r)}>
                  <A
                    href={`/app/production/issue-station${stationQuery(r.id, r)}`}
                    class="text-xs font-medium text-brand-600 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    1. Take from stock
                  </A>
                </Show>
                <A
                  href={`/app/production/weigh-parts${stationQuery(r.id, r)}`}
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
                {needsTakeFromStock(r) ? "3. Finish" : "2. Finish"}
              </button>
            </Show>
            <Show when={r.status === "completed"}>
              <Show when={!r.reversed_at}>
                <A
                  href="/app/inventory/serial-lot/pack-station"
                  class="rounded border border-brand-300 bg-brand-50 px-1.5 py-0.5 text-xs font-medium text-brand-700 hover:bg-brand-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  Next: Pack
                </A>
              </Show>
              <Show when={!r.reversed_at && canComplete()}>
                <button
                  type="button"
                  class="text-[11px] text-red-700 hover:underline disabled:opacity-50"
                  disabled={actionId() === r.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    void reverseCompleted(r);
                  }}
                >
                  Reverse posting
                </button>
              </Show>
              <Show when={r.reversed_at}>
                <span class="text-[11px] font-medium text-text-secondary">Reversed</span>
              </Show>
            </Show>
            <ActivityHistoryLink
              module="manufacturing"
              targetType="mfg_work_order"
              targetId={r.id}
              title={`History — ${r.work_order_no}`}
            />
          </div>
        ),
      },
    ];
  });

  return (
    <>
      <SpreadsheetGrid<WorkOrder>
        columns={columns()}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        selectable
        selectedIds={selectedIds()}
        onSelectionChange={(ids) => setSelectedIds(new Set(ids))}
        onNew={openNew}
        onEdit={(row) => void openEdit(row)}
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
            <Show when={isAssembly()}>
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
        pageSize={pageSize()} onPageSizeChange={setPageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        search={q()}
        onSearchChange={setQ}
        searchPlaceholder="Search job, recipe, item…"
        status={statusFilter()}
        onStatusChange={setStatusAndUrl}
        statusLabel="Status"
        statusOptions={isAssembly() ? ASSEMBLY_STATUS_TABS : DISASSEMBLY_STATUS_TABS}
        onRefresh={invalidate}
      />

      <Show when={selectedId() != null ? jobTrace.data : undefined}>
        {(trace) => {
          const wo = () => trace().wo;
          const needs = () => trace().needs;
          const actualFor = (itemId: number) =>
            wo().output_actuals?.find((a) => a.component_item_id === itemId)?.qty;
          const reasonLabel = (line: WorkOrderWasteView) =>
            line.waste_reason_code ? `${line.waste_reason_code} — ${line.waste_reason_name ?? ""}` : "—";
          return (
            <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
              <h2 class="text-sm font-semibold text-text-primary">
                {wo().work_order_no} — input, output, and difference
              </h2>
              <p class="mt-1 text-xs text-text-secondary">
                Raw material, each output, waste, and extra waste for this job.
              </p>
              <Show when={needs()?.input_line}>
                {(input) => (
                  <p class="mt-3 text-sm text-text-primary">
                    Raw material:{" "}
                    <button
                      type="button"
                      class="font-medium text-brand-600 hover:underline"
                      onClick={() =>
                        openItemBook({
                          item_id: input().component_item_id,
                          item_code: input().component_code,
                          item_name: input().component_name,
                        })
                      }
                    >
                      {input().component_code}
                    </button>{" "}
                    <span class="font-medium">{input().component_name}</span>
                    {" · expected "}
                    {input().stock_to_issue} {input().stock_unit_code}
                    <Show when={wo().actual_input_qty != null}>
                      {" · actual "}
                      {wo().actual_input_qty}
                    </Show>
                  </p>
                )}
              </Show>
              <table class="mt-3 min-w-full text-left text-sm">
                <thead class="text-xs uppercase text-text-secondary">
                  <tr>
                    <th class="py-1 pr-3">Output</th>
                    <th class="py-1 pr-3 text-right">Expected</th>
                    <th class="py-1 pr-3 text-right">Actual</th>
                    <th class="py-1 text-right">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={needs()?.lines ?? []}>
                    {(ln) => {
                      const actual = actualFor(ln.component_item_id);
                      const difference = actual == null ? null : actual - ln.stock_to_issue;
                      return (
                        <tr class="border-t border-stroke/70">
                          <td class="py-1.5 pr-3">
                            <button
                              type="button"
                              class="font-medium text-brand-600 hover:underline"
                              onClick={() =>
                                openItemBook({
                                  item_id: ln.component_item_id,
                                  item_code: ln.component_code,
                                  item_name: ln.component_name,
                                })
                              }
                            >
                              {ln.component_code}
                            </button>
                            {" — "}
                            {ln.component_name}
                          </td>
                          <td class="py-1.5 pr-3 text-right tabular-nums">{ln.stock_to_issue}</td>
                          <td class="py-1.5 pr-3 text-right tabular-nums">{actual ?? "—"}</td>
                          <td class="py-1.5 text-right tabular-nums">{difference ?? "—"}</td>
                        </tr>
                      );
                    }}
                  </For>
                </tbody>
              </table>
              <Show when={(wo().waste_lines?.length ?? 0) > 0}>
                <h3 class="mt-4 text-xs font-semibold uppercase text-text-secondary">Waste and extra waste</h3>
                <ul class="mt-1 space-y-1 text-sm">
                  <For each={wo().waste_lines ?? []}>
                    {(line) => (
                      <li class="flex flex-wrap justify-between gap-2">
                        <span>
                          {line.component_name || "Extra waste"}
                          {" · "}
                          {reasonLabel(line)}
                        </span>
                        <span class="tabular-nums">
                          actual {line.qty} · expected {line.expected_qty} · difference {line.difference}
                        </span>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </section>
          );
        }}
      </Show>

      <EntityModal
        open={modalOpen()}
        title={editing() ? `Job ${editing()!.work_order_no}` : copy().newJobTitle}
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
        headerActions={
          <Show when={editing()}>
            {(wo) => (
              <RecordHistoryButton
                variant="button"
                targetType="mfg_work_order"
                targetId={wo().id}
                title={`History — ${wo().work_order_no}`}
              />
            )}
          </Show>
        }
      >
        <Show when={editing() && editing()!.status !== "draft"}>
          <p class="col-span-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            This job already started (not draft). Close and use <strong>Revert to draft</strong> on the row if you need
            to change qty/location (only when nothing was taken from stock yet).
          </p>
        </Show>
        <Show when={!editing()}>
          <draft.DraftBanner />
        </Show>
        <FormErrorSummary errors={fieldErrors} />
        <ModalFormGuide guideId={copy().jobGuideId} spanFull />
        <LookupCombo
          label="Recipe"
          required
          value={bomLabel}
          selectedId={bomId}
          onInput={setBomLabel}
          onSelect={(o) => { setBomId(o.id); setBomLabel(o.label); }}
          onClear={() => { setBomId(null); setBomLabel(""); }}
          fetchOptions={makeFetchBoms(mode())}
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
        <Field label={`${copy().jobQtyLabel} *${finishedUnit() ? ` (${finishedUnit()})` : ""}`}>
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
                    <p class="font-medium text-text-primary">{copy().materialsInputLabel}</p>
                    <p>
                      <button
                        type="button"
                        class="font-medium text-brand-600 hover:underline"
                        onClick={() =>
                          openItemBook({
                            item_id: input().component_item_id,
                            item_code: input().component_code,
                            item_name: input().component_name,
                          })
                        }
                      >
                        {input().component_code}
                      </button>
                      {": "}
                      {input().stock_to_issue.toFixed(4)} {input().stock_unit_code}
                    </p>
                  </div>
                )}
              </Show>
              <p class="text-sm font-medium text-text-primary">
                {mode() === "disassembly" ? copy().materialsOutputLabel : "Materials needed"}
              </p>
              <p class="text-xs text-text-secondary">
                {mode() === "disassembly"
                  ? `Batch ${m().output_qty} · yield ${m().yield_pct}%`
                  : `Will receive ${m().receive_qty} ${m().finished_base_unit_code || finishedUnit()} · batch ${m().output_qty} · yield ${m().yield_pct}%`}
              </p>
              <div class="overflow-x-auto rounded border border-stroke">
                <table class="min-w-full text-left text-xs">
                  <thead class="bg-slate-50 text-text-secondary">
                    <tr>
                      <th class="px-2 py-1.5">Item</th>
                      <th class="px-2 py-1.5">Recipe qty</th>
                      <Show when={mode() === "assembly"}>
                        <th class="px-2 py-1.5">Scrap/spare</th>
                      </Show>
                      <th class="px-2 py-1.5">{mode() === "disassembly" ? "Expected" : "To issue"}</th>
                      <th class="px-2 py-1.5">On hand</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={m().lines}>
                      {(ln) => (
                        <tr class={ln.shortage > 0 ? "bg-red-50 text-red-800" : ""}>
                          <td class="px-2 py-1.5">
                            <button
                              type="button"
                              class="font-medium text-brand-600 hover:underline"
                              onClick={() =>
                                openItemBook({
                                  item_id: ln.component_item_id,
                                  item_code: ln.component_code,
                                  item_name: ln.component_name,
                                })
                              }
                            >
                              {ln.component_code}
                            </button>
                            {" — "}
                            {ln.component_name}
                          </td>
                          <td class="px-2 py-1.5">{ln.bom_qty} {ln.bom_unit_code}</td>
                          <Show when={mode() === "assembly"}>
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
        mode={completeTarget() ? woType(completeTarget()!) : mode() === "all" ? "assembly" : mode()}
        releaseFirst={
          completeTarget()
            ? woType(completeTarget()!) === "assembly" || woType(completeTarget()!) === "recipe"
            : isAssembly()
        }
        onClose={() => setCompleteTarget(null)}
        onCompleted={() => invalidate()}
      />
      <WoSalesOrderLinePickerModal
        open={soPickerOpen()}
        onClose={() => setSoPickerOpen(false)}
        onConfirm={(picked) => void applySalesOrderLines(picked)}
      />
      <InvBookLedgerModal open={ledgerRow() != null} row={ledgerRow()} onClose={() => setLedgerRow(null)} />
    </>
  );
}
