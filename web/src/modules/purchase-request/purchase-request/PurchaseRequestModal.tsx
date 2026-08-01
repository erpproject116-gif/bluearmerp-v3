import { createEffect, createSignal, For, Show } from "solid-js";
import { useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../../shared/api";
import { getActiveBranchCurrent } from "../../../shared/activeContext";
import type { LookupOption } from "../../../shared/LookupCombo";
import { DateInput } from "../../../shared/DateInput";
import { ModalField } from "../../../shared/ModalField";
import { ModalLookupField } from "../../../shared/ModalLookupField";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { PURCHASE_REQUEST_ENTITY } from "../../../shared/entityTypes";
import { requireFields, submitEntity } from "../../../shared/handleSaveResult";
import { useDocumentDraft } from "../../../shared/useDocumentDraft";
import { useToast } from "../../../shared/toast";
import { hasPermission, useAuth } from "../../../shared/auth-context";
import { buildRequiredChecksForSave, useFormFieldSettings } from "../../../shared/useFormFieldSettings";
import { WideEntityModal } from "../../../shared/WideEntityModal";
import { ModalFormGuide } from "../../../shared/ModalFormGuide";
import { LifecycleReadOnlyShell } from "../../../shared/documentLifecycle";
import { ChangeLogPanel } from "../../../shared/ChangeLogPanel";
import { HistoryLogModal } from "../../../shared/HistoryLogModal";
import { defaultInputBasis, formatRateSummary, formatTaxTypeLabel } from "../../../shared/taxcalc";
import { fetchLocationOptions, useActiveCurrencies, useActiveTaxTypes } from "../../../shared/useDocumentLookups";
import { QuickLocationModal } from "../../../shared/QuickLocationModal";
import { QuickTaxTypeModal } from "../../../shared/QuickTaxTypeModal";
import { ProgressStatusMenu } from "./ProgressStatusMenu";
import { PurchaseRequestApprovalPanel } from "./PurchaseRequestApprovalPanel";
import { SalesOrderLinePickerModal, type PickedSalesOrderLine } from "./SalesOrderLinePickerModal";
import {
  QuotationLinePickerModal,
  type PickedQuotationLine,
} from "../../sales-order/sales-order/QuotationLinePickerModal";
import { LoadSlipMenu, PURCHASE_REQUEST_LOAD_SLIP_OPTIONS, filterLoadSlipOptions } from "../../../shared/LoadSlipMenu";
import { OpenPOLinePickerModal } from "../../finance/supplier-invoices/OpenPOLinePickerModal";
import type { OpenPOLine } from "../../../shared/useSupplierInvoiceList";
import {
  PurchaseRequestLineGrid,
  emptyPurchaseRequestLine,
  recalculatePurchaseRequestLines,
  type PurchaseRequestLineRow,
} from "./PurchaseRequestLineGrid";
import { docSeedLinePatch, takeDocSeed } from "../../../shared/docSeed";

export type PurchaseRequestDetail = {
  id: number;
  request_date: string;
  date_seq: number;
  date_no_display: string;
  purchase_request_no: string;
  tax_type_id: number;
  tax_type_name?: string;
  currency_id: number;
  currency_code?: string;
  partner_id?: number | null;
  partner_name: string;
  pic_user_id?: number | null;
  pic_name: string;
  location_id: number;
  location_name?: string;
  project_id?: number | null;
  project_name?: string | null;
  cc?: string | null;
  domestic_foreign: string;
  send_status: string;
  progress_status: string;
  approved_at?: string | null;
  approved_by_name?: string;
  total_qty: number;
  reference?: string | null;
  notes?: string | null;
  subtotal: number;
  tax_total: number;
  grand_total: number;
  created_by_name?: string;
  lines?: Array<{
    line_no: number;
    partner_id?: number | null;
    partner_code: string;
    partner_name: string;
    item_id?: number | null;
    item_code: string;
    item_name: string;
    spec_name?: string | null;
    description?: string | null;
    qty: number;
    unit_id?: number | null;
    unit_code?: string | null;
    unit_non_vat: number;
    non_vat_total: number;
    tax_amount: number;
    unit_vat_inc: number;
    line_total: number;
    remark?: string | null;
    planned_serial_nos?: string[];
    track_serial?: boolean;
    serial_policy?: string;
  }>;
};

type Props = {
  open: boolean;
  editing: PurchaseRequestDetail | null;
  /** Deleted (soft-deleted) document opened for viewing — no edits allowed. */
  readOnly?: boolean;
  onClose: () => void;
  onSaved: () => void;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateNoDisplay(iso: string, seq: number) {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return String(seq);
  return `${m}/${d}/${y}-${seq}`;
}

async function fetchProjects(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; project_name: string }[]>(`/api/v1/inventory/projects?${qs}`);
  return (res.data ?? []).map((p) => ({ id: p.id, label: p.project_name }));
}

async function fetchUsers(q: string): Promise<LookupOption[]> {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  const res = await apiFetch<{ id: number; full_name: string; email: string }[]>(`/api/v1/inventory/after-sales/users${qs}`);
  return (res.data ?? []).map((u) => ({ id: u.id, label: u.full_name, sublabel: u.email }));
}

function linesFromDetail(lines?: PurchaseRequestDetail["lines"]): PurchaseRequestLineRow[] {
  if (!lines?.length) return [emptyPurchaseRequestLine(1)];
  return lines.map((ln) => ({
    line_no: ln.line_no,
    partner_id: ln.partner_id,
    partner_code: ln.partner_code ?? "",
    partner_name: ln.partner_name ?? "",
    item_id: ln.item_id,
    item_code: ln.item_code ?? "",
    item_name: ln.item_name ?? "",
    spec_name: ln.spec_name ?? "",
    description: ln.description ?? "",
    qty: ln.qty != null ? String(ln.qty) : "1",
    unit_id: ln.unit_id ?? null,
    unit_code: ln.unit_code ?? "",
    unit_price: String(ln.unit_vat_inc ?? 0),
    input_basis: "vat_inc_unit" as const,
    unit_non_vat: String(ln.unit_non_vat ?? 0),
    non_vat_total: String(ln.non_vat_total ?? 0),
    tax_amount: String(ln.tax_amount ?? 0),
    unit_vat_inc: String(ln.unit_vat_inc ?? 0),
    line_total: String(ln.line_total ?? 0),
    remark: ln.remark ?? "",
    planned_serial_nos: ln.planned_serial_nos ?? [],
    track_serial: Boolean(ln.track_serial),
    serial_policy: ln.serial_policy ?? "required",
  }));
}

export function PurchaseRequestModal(props: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const auth = useAuth();
  const taxTypesQuery = useActiveTaxTypes(() => props.open);
  const currenciesQuery = useActiveCurrencies(() => props.open);
  const taxTypes = () => taxTypesQuery.data ?? [];
  const currencies = () => currenciesQuery.data ?? [];
  const { fields, byKey } = useFormFieldSettings(PURCHASE_REQUEST_ENTITY.purchaseRequest);
  const [saving, setSaving] = createSignal(false);
  const [historyOpen, setHistoryOpen] = createSignal(false);
  const [soPickerOpen, setSoPickerOpen] = createSignal(false);
  const [quotationPickerOpen, setQuotationPickerOpen] = createSignal(false);
  const [poPickerOpen, setPoPickerOpen] = createSignal(false);
  const [showNewLocation, setShowNewLocation] = createSignal(false);
  const [newLocationName, setNewLocationName] = createSignal("");
  const [showNewTaxType, setShowNewTaxType] = createSignal(false);
  const [newTaxTypeName, setNewTaxTypeName] = createSignal("");
  const [requestDate, setRequestDate] = createSignal(todayISO());
  const [dateSeq, setDateSeq] = createSignal(1);
  const [dateNoDisplay, setDateNoDisplay] = createSignal("");
  const [purchaseRequestNo, setPurchaseRequestNo] = createSignal("");
  const [taxTypeId, setTaxTypeId] = createSignal<number | null>(null);
  const [taxTypeLabel, setTaxTypeLabel] = createSignal("");
  const [currencyId, setCurrencyId] = createSignal<number | null>(null);
  const [picUserId, setPicUserId] = createSignal<number | null>(null);
  const [picName, setPicName] = createSignal("");
  const [locationId, setLocationId] = createSignal<number | null>(null);
  const [locationLabel, setLocationLabel] = createSignal("");
  const [projectId, setProjectId] = createSignal<number | null>(null);
  const [projectLabel, setProjectLabel] = createSignal("");
  const [projectName, setProjectName] = createSignal("");
  const [cc, setCc] = createSignal("");
  const [domesticForeign, setDomesticForeign] = createSignal<"domestic" | "foreign">("domestic");
  const [sendStatus, setSendStatus] = createSignal<"unsent" | "sent">("unsent");
  const [reference, setReference] = createSignal("");
  const [notes, setNotes] = createSignal("");
  const [progressStatus, setProgressStatus] = createSignal("unconfirmed");
  const [approvedAt, setApprovedAt] = createSignal<string | null>(null);
  const [approvedByName, setApprovedByName] = createSignal("");
  const [lines, setLines] = createSignal<PurchaseRequestLineRow[]>([emptyPurchaseRequestLine(1)]);

  const selectedTaxType = () => taxTypes().find((t) => t.id === taxTypeId()) ?? null;

  createEffect(() => {
    const id = taxTypeId();
    if (id == null || taxTypeLabel()) return;
    const meta = taxTypes().find((t) => t.id === id);
    if (meta) setTaxTypeLabel(formatTaxTypeLabel(meta.name, meta.tax_mode, meta.rate_percent));
  });

  const buildDraftPayload = () => ({
    request_date: requestDate(),
    date_seq: dateSeq(),
    tax_type_id: taxTypeId(),
    currency_id: currencyId(),
    pic_user_id: picUserId(),
    pic_name: picName(),
    location_id: locationId(),
    location_label: locationLabel(),
    project_id: projectId(),
    project_label: projectLabel(),
    project_name: projectName(),
    cc: cc(),
    domestic_foreign: domesticForeign(),
    send_status: sendStatus(),
    reference: reference(),
    notes: notes(),
    progress_status: progressStatus(),
    lines: lines(),
  });

  const applyDraftPayload = (payload: ReturnType<typeof buildDraftPayload>) => {
    setRequestDate(payload.request_date);
    setDateSeq(payload.date_seq);
    setTaxTypeId(payload.tax_type_id);
    setTaxTypeLabel("");
    setCurrencyId(payload.currency_id);
    setPicUserId(payload.pic_user_id);
    setPicName(payload.pic_name);
    setLocationId(payload.location_id);
    setLocationLabel(payload.location_label);
    setProjectId(payload.project_id);
    setProjectLabel(payload.project_label);
    setProjectName(payload.project_name);
    setCc(payload.cc);
    setDomesticForeign(payload.domestic_foreign);
    setSendStatus(payload.send_status);
    setReference(payload.reference);
    setNotes(payload.notes);
    setProgressStatus(payload.progress_status || "unconfirmed");
    setLines(payload.lines);
    setDateNoDisplay(formatDateNoDisplay(payload.request_date, payload.date_seq));
  };

  const draft = useDocumentDraft({
    entityType: PURCHASE_REQUEST_ENTITY.purchaseRequest,
    draftKey: () => (props.editing ? `edit-${props.editing.id}` : "new"),
    getPayload: buildDraftPayload,
    onApply: applyDraftPayload,
    enabled: () => props.open,
    // No autoApply here: the create-flow reset effect below also async-fetches a fresh
    // date_seq/date-no preview, which can resolve after draft recovery and stomp the
    // recovered date_seq. Banner-only avoids that overwrite race.
  });

  const fetchTaxTypeOptions = async (q: string): Promise<LookupOption[]> => {
    const qq = q.trim().toLowerCase();
    return taxTypes()
      .filter((t) => !qq || t.name.toLowerCase().includes(qq))
      .map((t) => ({ id: t.id, label: formatTaxTypeLabel(t.name, t.tax_mode, t.rate_percent) }));
  };

  const onTaxTypeChange = async (newId: number | null) => {
    setTaxTypeId(newId);
    const meta = taxTypes().find((t) => t.id === newId);
    setTaxTypeLabel(meta ? formatTaxTypeLabel(meta.name, meta.tax_mode, meta.rate_percent) : "");
    if (!newId || !meta) return;
    const recalc = await recalculatePurchaseRequestLines(lines(), newId, meta);
    setLines(recalc);
  };

  const applySalesOrderLines = async (picked: PickedSalesOrderLine[]) => {
    if (picked.length === 0) return;
    const first = picked[0];
    setTaxTypeId(first.tax_type_id);
    setCurrencyId(first.currency_id);
    setLocationId(first.location_id);
    setLocationLabel(first.location_name);
    if (first.pic_name) setPicName(first.pic_name);

    const meta = taxTypes().find((t) => t.id === first.tax_type_id);
    setTaxTypeLabel(meta ? formatTaxTypeLabel(meta.name, meta.tax_mode, meta.rate_percent) : "");
    const basis = meta ? defaultInputBasis(meta.tax_mode) : "vat_inc_unit";
    const newLines: PurchaseRequestLineRow[] = picked.map((row, i) => ({
      ...emptyPurchaseRequestLine(i + 1, String(row.unit_vat_inc), basis),
      item_id: row.item_id ?? null,
      item_code: row.item_code,
      item_name: row.item_name,
      description: row.description ?? "",
      qty: String(row.balance_qty),
      unit_price: String(row.unit_vat_inc),
      remark: row.remark ?? "",
      source_sales_order_line_id: row.source_sales_order_line_id,
      track_serial: Boolean(row.track_serial),
      planned_serial_nos: row.planned_serial_nos ?? [],
    }));
    if (meta && first.tax_type_id) {
      const recalc = await recalculatePurchaseRequestLines(newLines, first.tax_type_id, meta);
      setLines(recalc);
    } else {
      setLines(newLines);
    }
  };

  const applyQuotationLines = async (picked: PickedQuotationLine[]) => {
    if (picked.length === 0) return;
    const first = picked[0];
    setTaxTypeId(first.tax_type_id);
    setCurrencyId(first.currency_id);
    setLocationId(first.location_id);
    setLocationLabel(first.location_name);
    if (first.pic_name) setPicName(first.pic_name);
    const meta = taxTypes().find((t) => t.id === first.tax_type_id);
    setTaxTypeLabel(meta ? formatTaxTypeLabel(meta.name, meta.tax_mode, meta.rate_percent) : "");
    const basis = meta ? defaultInputBasis(meta.tax_mode) : "vat_inc_unit";
    const newLines: PurchaseRequestLineRow[] = picked.map((row, i) => ({
      ...emptyPurchaseRequestLine(i + 1, String(row.unit_vat_inc), basis),
      item_id: row.item_id ?? null,
      item_code: row.item_code,
      item_name: row.item_name,
      description: row.description ?? "",
      qty: String(row.balance_qty > 0 ? row.balance_qty : row.qty),
      unit_price: String(row.unit_vat_inc),
      remark: row.remark ?? "",
    }));
    if (meta && first.tax_type_id) {
      setLines(await recalculatePurchaseRequestLines(newLines, first.tax_type_id, meta));
    } else {
      setLines(newLines);
    }
  };

  const mapPoOntoPurchaseRequest = async (picked: OpenPOLine[]) => {
    if (picked.length === 0) return;
    const meta = taxTypes().find((t) => t.id === taxTypeId());
    const basis = meta ? defaultInputBasis(meta.tax_mode) : "vat_inc_unit";
    const mapped = picked.map((row, i) => ({
      ...emptyPurchaseRequestLine(i + 1, String(row.unit_vat_inc), basis),
      item_id: row.item_id ?? null,
      item_code: row.item_code,
      item_name: row.item_name,
      qty: String(row.balance_qty),
      unit_price: String(row.unit_vat_inc),
      track_serial: Boolean(row.track_serial),
    }));
    const merged = [...lines().filter((ln) => ln.item_id || ln.item_code), ...mapped].map((ln, i) => ({
      ...ln,
      line_no: i + 1,
    }));
    if (meta && taxTypeId()) {
      setLines(await recalculatePurchaseRequestLines(merged, taxTypeId()!, meta));
    } else {
      setLines(merged);
    }
  };

  const loadPreview = async (date: string, seq?: number) => {
    const res = await apiFetch<{ date_seq: number; purchase_request_no: string }>(
      `/api/v1/purchase-request/purchase-requests/preview-sequences?request_date=${encodeURIComponent(date)}`,
    );
    if (res.success && res.data) {
      const nextSeq = seq ?? res.data.date_seq;
      setDateSeq(nextSeq);
      setDateNoDisplay(formatDateNoDisplay(date, nextSeq));
      setPurchaseRequestNo(res.data.purchase_request_no);
    }
  };

  let seededNewLines = false;

  createEffect(() => {
    if (!props.open) return;
    const ed = props.editing;
    if (ed) {
      setRequestDate(ed.request_date);
      setDateSeq(ed.date_seq);
      setDateNoDisplay(ed.date_no_display);
      setPurchaseRequestNo(ed.purchase_request_no);
      setTaxTypeId(ed.tax_type_id);
      setTaxTypeLabel(ed.tax_type_name ?? "");
      setCurrencyId(ed.currency_id);
      setPicUserId(ed.pic_user_id ?? null);
      setPicName(ed.pic_name);
      setLocationId(ed.location_id);
      setLocationLabel(ed.location_name ?? "");
      setProjectId(ed.project_id ?? null);
      setProjectLabel(ed.project_name ?? "");
      setProjectName(ed.project_name ?? "");
      setCc(ed.cc ?? "");
      setDomesticForeign(ed.domestic_foreign === "foreign" ? "foreign" : "domestic");
      setSendStatus(ed.send_status === "sent" ? "sent" : "unsent");
      setReference(ed.reference ?? "");
      setNotes(ed.notes ?? "");
      setProgressStatus(ed.progress_status || "unconfirmed");
      setApprovedAt(ed.approved_at ?? null);
      setApprovedByName(ed.approved_by_name ?? "");
      setLines(linesFromDetail(ed.lines));
    } else {
      const seed = takeDocSeed("purchase_request");
      const seedLines = (seed?.lines ?? []).slice(0, 200).map((line, index) => ({
        ...emptyPurchaseRequestLine(index + 1),
        ...docSeedLinePatch(line),
      }));
      setRequestDate(todayISO());
      setPicUserId(null);
      setPicName("");
      const branch = getActiveBranchCurrent();
      setLocationId(branch?.id ?? null);
      setLocationLabel(branch?.name ?? "");
      setProjectId(null);
      setProjectLabel("");
      setProjectName("");
      setCc("");
      setDomesticForeign("domestic");
      setSendStatus("unsent");
      setReference("");
      setNotes("");
      setProgressStatus("unconfirmed");
      seededNewLines = seedLines.length > 0;
      if (seededNewLines) {
        setLines(seedLines);
        if (seed?.needs_qty_review) {
          toast.warning("Baiko prefilled item lines with qty 1 — review quantities before saving.");
        }
      } else {
        setLines([emptyPurchaseRequestLine(1)]);
      }
      void loadPreview(todayISO());
    }
  });

  createEffect(() => {
    if (!props.open || props.editing) return;
    const tt = taxTypes();
    const cc = currencies();
    if (!tt.length || !cc.length) return;
    if (!taxTypeId()) {
      const first = tt[0];
      setTaxTypeId(first.id);
      setTaxTypeLabel(formatTaxTypeLabel(first.name, first.tax_mode, first.rate_percent));
      const basis = defaultInputBasis(first.tax_mode);
      if (seededNewLines) {
        const seeded = lines().map((line) => ({ ...line, input_basis: basis }));
        seededNewLines = false;
        void recalculatePurchaseRequestLines(seeded, first.id, first).then(setLines);
      } else {
        setLines([emptyPurchaseRequestLine(1, "", basis)]);
      }
    }
    if (!currencyId()) {
      const def = cc.find((c) => c.is_default) ?? cc[0];
      if (def) setCurrencyId(def.id);
    }
  });

  createEffect(() => {
    if (props.open && !props.editing) void loadPreview(requestDate());
  });

  const onDateSeqChange = (seq: number) => {
    setDateSeq(seq);
    setDateNoDisplay(formatDateNoDisplay(requestDate(), seq));
  };

  const save = async () => {
    if (props.readOnly) return;
    if (!taxTypeId()) {
      toast.warning("Please select a transaction type.");
      return;
    }
    if (!currencyId()) {
      toast.warning("Please select a currency.");
      return;
    }
    if (!locationId()) {
      toast.warning("Please select a location.");
      return;
    }
    const status = (progressStatus() || "unconfirmed").trim() || "unconfirmed";
    if (progressStatus() !== status) setProgressStatus(status);
    const { checks, values: formValues } = buildRequiredChecksForSave(
      fields(),
      {
        request_date: requestDate(),
        location_id: locationId(),
        tax_type_id: taxTypeId(),
        currency_id: currencyId(),
        pic_name: picName(),
        reference_no: reference(),
        notes: notes(),
        project_id: projectId(),
        progress_status: status,
      },
    );
    const clientError = requireFields(formValues, checks);
    if (clientError) {
      toast.warning(clientError);
      return;
    }

    const body: Record<string, unknown> = {
      request_date: requestDate(),
      tax_type_id: taxTypeId(),
      currency_id: currencyId(),
      pic_user_id: picUserId(),
      pic_name: picName(),
      location_id: locationId(),
      project_id: projectId(),
      project_name: projectName() || null,
      cc: cc() || null,
      domestic_foreign: domesticForeign(),
      send_status: sendStatus(),
      reference: reference() || null,
      notes: notes() || null,
      progress_status: status,
      lines: lines().map((ln, i) => ({
        line_no: i + 1,
        partner_id: ln.partner_id || null,
        partner_code: ln.partner_code,
        partner_name: ln.partner_name,
        item_id: ln.item_id || null,
        item_code: ln.item_code,
        item_name: ln.item_name,
        spec_name: ln.spec_name || null,
        description: ln.description || null,
        qty: ln.qty === "" ? 0 : Number(ln.qty),
        unit_id: ln.unit_id || null,
        unit_code: ln.unit_code || null,
        unit_price: ln.unit_price === "" ? 0 : Number(ln.unit_price),
        input_basis: ln.input_basis,
        remark: ln.remark || null,
        source_sales_order_line_id: ln.source_sales_order_line_id ?? null,
        planned_serial_nos: ln.planned_serial_nos ?? [],
      })),
    };
    if (!props.editing) {
      body.date_seq = dateSeq();
    }

    setSaving(true);
    const ed = props.editing;
    const ok = await submitEntity(
      () =>
        ed
          ? apiFetch(`/api/v1/purchase-request/purchase-requests/${ed.id}`, { method: "PATCH", body: JSON.stringify(body) }, { silent: true })
          : apiFetch("/api/v1/purchase-request/purchase-requests", { method: "POST", body: JSON.stringify(body) }, { silent: true }),
      toast,
      ed ? "Purchase request updated." : "Purchase request created.",
    );
    setSaving(false);
    if (!ok) return;
    await draft.clearOnSave();
    props.onSaved();
    props.onClose();
  };

  return (
    <>
    <WideEntityModal
      open={props.open}
      title={props.editing ? (props.readOnly ? "View Purchase Request (deleted)" : "Edit Purchase Request") : "New Purchase Request"}
      onClose={() => props.onClose()}
      onSave={() => void save()}
      readOnly={props.readOnly}
      saving={saving()}
      headerActions={
        <Show when={props.editing}>
          <button type="button" class="rounded-lg border border-stroke px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-slate-50" onClick={() => setHistoryOpen(true)}>
            History
          </button>
        </Show>
      }
    >
      <LifecycleReadOnlyShell readOnly={props.readOnly ?? false}>
      <ModalFormGuide guideId="purchase_request" />
      <draft.DraftBanner />
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Date-no">
        <input class={inputClass} value={dateNoDisplay()} readOnly />
      </Field>
      <Field label="Purchase Request No.">
        <input class={inputClass} value={purchaseRequestNo()} readOnly />
      </Field>
      <ModalField settings={byKey} fieldKey="request_date" fallbackLabel="Date" fallbackRequired>
        {(m) => (
          <DateInput value={requestDate()} disabled={m.disabled} onInput={(e) => setRequestDate(e.currentTarget.value)} />
        )}
      </ModalField>
      <Show when={!props.editing}>
        <Field label="Date seq">
          <input
            type="number"
            class={inputClass}
            min={1}
            value={dateSeq()}
            onInput={(e) => onDateSeqChange(Math.max(1, Number(e.currentTarget.value) || 1))}
          />
        </Field>
      </Show>
      <ModalLookupField
        settings={byKey}
        fieldKey="tax_type_id"
        fallbackLabel="Transaction type"
        fallbackRequired
        value={taxTypeLabel}
        selectedId={taxTypeId}
        onInput={setTaxTypeLabel}
        onSelect={(o) => void onTaxTypeChange(o.id)}
        onClear={() => void onTaxTypeChange(null)}
        fetchOptions={fetchTaxTypeOptions}
        createLabel="Add tax type"
        onCreate={
          hasPermission(auth.me, "quotation.tax_types", "write")
            ? (q) => {
                setNewTaxTypeName(q);
                setShowNewTaxType(true);
              }
            : undefined
        }
      />
      <Show when={selectedTaxType()}>
        {(t) => (
          <p class="mt-1 text-xs text-text-secondary md:col-span-2">{formatRateSummary(t().tax_mode, t().rate_percent)}</p>
        )}
      </Show>
      <ModalField settings={byKey} fieldKey="currency_id" fallbackLabel="Currency" fallbackRequired>
        {(m) => (
          <select
            class={inputClass}
            value={currencyId() ?? ""}
            disabled={m.disabled}
            onChange={(e) => setCurrencyId(Number(e.currentTarget.value) || null)}
          >
            <option value="">Select…</option>
            <For each={currencies()}>{(c) => <option value={c.id}>{c.currency_code} — {c.name}</option>}</For>
          </select>
        )}
      </ModalField>
      <ModalLookupField
        settings={byKey}
        fieldKey="pic_name"
        fallbackLabel="PIC"
        value={picName}
        selectedId={picUserId}
        onInput={setPicName}
        onSelect={(o) => {
          setPicUserId(o.id);
          setPicName(o.label);
        }}
        onClear={() => {
          setPicUserId(null);
          setPicName("");
        }}
        fetchOptions={fetchUsers}
      />
      <ModalLookupField
        settings={byKey}
        fieldKey="location_id"
        fallbackLabel="Location"
        fallbackRequired
        value={locationLabel}
        selectedId={locationId}
        onInput={setLocationLabel}
        onSelect={(o) => {
          setLocationId(o.id);
          setLocationLabel(o.label);
        }}
        onClear={() => {
          setLocationId(null);
          setLocationLabel("");
        }}
        fetchOptions={fetchLocationOptions}
        createLabel="Add location"
        onCreate={
          hasPermission(auth.me, "inventory.locations", "write")
            ? (q) => {
                setNewLocationName(q);
                setShowNewLocation(true);
              }
            : undefined
        }
      />
      <ModalLookupField
        settings={byKey}
        fieldKey="project_id"
        fallbackLabel="Project"
        value={projectLabel}
        selectedId={projectId}
        onInput={setProjectLabel}
        onSelect={(o) => {
          setProjectId(o.id);
          setProjectLabel(o.label);
          setProjectName(o.label);
        }}
        onClear={() => {
          setProjectId(null);
          setProjectLabel("");
        }}
        fetchOptions={fetchProjects}
      />
      <Field label="Project name">
        <input class={inputClass} value={projectName()} onInput={(e) => setProjectName(e.currentTarget.value)} />
      </Field>
      <Field label="Cc">
        <input class={inputClass} value={cc()} onInput={(e) => setCc(e.currentTarget.value)} />
      </Field>
      <Field label="Domestic / Foreign">
        <div class="flex gap-4 pt-2 text-sm">
          <label class="flex items-center gap-1.5">
            <input type="radio" name="domestic_foreign" checked={domesticForeign() === "domestic"} onChange={() => setDomesticForeign("domestic")} />
            Domestic
          </label>
          <label class="flex items-center gap-1.5">
            <input type="radio" name="domestic_foreign" checked={domesticForeign() === "foreign"} onChange={() => setDomesticForeign("foreign")} />
            Foreign
          </label>
        </div>
      </Field>
      <Field label="Send status">
        <select class={inputClass} value={sendStatus()} onChange={(e) => setSendStatus(e.currentTarget.value as "unsent" | "sent")}>
          <option value="unsent">Unsent</option>
          <option value="sent">Sent</option>
        </select>
      </Field>
      <Field label="Progress status">
        <ProgressStatusMenu value={progressStatus()} onChange={setProgressStatus} />
      </Field>
      <Show when={props.editing}>
        <div class="col-span-full">
          <PurchaseRequestApprovalPanel
            purchaseRequestId={props.editing!.id}
            progressStatus={progressStatus()}
            approvedAt={approvedAt()}
            approvedByName={approvedByName()}
            onChanged={async () => {
              const res = await apiFetch<PurchaseRequestDetail>(`/api/v1/purchase-request/purchase-requests/${props.editing!.id}`);
              if (res.success && res.data) {
                setProgressStatus(res.data.progress_status);
                setApprovedAt(res.data.approved_at ?? null);
                setApprovedByName(res.data.approved_by_name ?? "");
              }
              props.onSaved();
            }}
          />
        </div>
      </Show>
      <ModalField settings={byKey} fieldKey="reference_no" fallbackLabel="Reference">
        {(m) => (
          <input
            class={inputClass}
            value={reference()}
            placeholder={m.placeholder}
            disabled={m.disabled}
            onInput={(e) => setReference(e.currentTarget.value)}
          />
        )}
      </ModalField>
      <ModalField settings={byKey} fieldKey="notes" fallbackLabel="Notes" span="full">
        {(m) => (
          <textarea
            class={inputClass}
            rows={2}
            value={notes()}
            placeholder={m.placeholder}
            disabled={m.disabled}
            onInput={(e) => setNotes(e.currentTarget.value)}
          />
        )}
      </ModalField>
      <Show when={props.editing}>
        <Field label="Created by">
          <input class={inputClass} value={props.editing?.created_by_name ?? ""} readOnly />
        </Field>
      </Show>
      </div>
      <div class="col-span-full mb-2">
        <LoadSlipMenu
          options={filterLoadSlipOptions(PURCHASE_REQUEST_LOAD_SLIP_OPTIONS, auth.me)}
          onSelect={(id) => {
            if (id === "so") setSoPickerOpen(true);
            if (id === "quotation") setQuotationPickerOpen(true);
            if (id === "po") setPoPickerOpen(true);
          }}
        />
      </div>
      <p class="col-span-full mb-2 text-xs text-text-secondary">
        Free-text products are allowed on Purchase Requests. Register items in Inventory before converting to a Purchase Order.
      </p>
      <PurchaseRequestLineGrid
        lines={lines}
        onChange={setLines}
        taxTypeId={taxTypeId}
        taxTypeMeta={() => {
          const t = selectedTaxType();
          return t ? { tax_mode: t.tax_mode, rate_percent: t.rate_percent } : null;
        }}
        locationId={locationId}
      />
      <ChangeLogPanel targetType="pr_purchase_request" targetId={props.editing?.id} />
      </LifecycleReadOnlyShell>
    </WideEntityModal>
    <HistoryLogModal open={historyOpen} onClose={() => setHistoryOpen(false)} targetType="pr_purchase_request" targetId={props.editing?.id} title="History — Purchase Request" />
    <SalesOrderLinePickerModal
      open={soPickerOpen()}
      onClose={() => setSoPickerOpen(false)}
      onConfirm={(picked) => void applySalesOrderLines(picked)}
    />
    <QuotationLinePickerModal
      open={quotationPickerOpen()}
      onClose={() => setQuotationPickerOpen(false)}
      onConfirm={(picked) => void applyQuotationLines(picked)}
    />
    <OpenPOLinePickerModal
      open={poPickerOpen()}
      mapOnly
      onClose={() => setPoPickerOpen(false)}
      onConfirm={(picked) => void mapPoOntoPurchaseRequest(picked)}
    />
    <QuickLocationModal
      open={showNewLocation()}
      initialName={newLocationName()}
      onClose={() => setShowNewLocation(false)}
      onCreated={(l) => {
        setLocationId(l.id);
        setLocationLabel(l.location_name);
      }}
    />
    <QuickTaxTypeModal
      open={showNewTaxType()}
      initialName={newTaxTypeName()}
      onClose={() => setShowNewTaxType(false)}
      onCreated={(t) => {
        void queryClient.invalidateQueries({ queryKey: ["quotation-tax-types"] });
        setTaxTypeId(t.id);
        setTaxTypeLabel(formatTaxTypeLabel(t.name, t.tax_mode, t.rate_percent));
        void recalculatePurchaseRequestLines(lines(), t.id, t).then(setLines);
      }}
    />
    </>
  );
}
