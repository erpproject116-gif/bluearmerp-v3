import { createEffect, createSignal, For, Show, Suspense, lazy } from "solid-js";
import { useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../../shared/api";
import { getActiveBranchCurrent } from "../../../shared/activeContext";
import type { LookupOption } from "../../../shared/LookupCombo";
import { DateInput } from "../../../shared/DateInput";
import { ModalField } from "../../../shared/ModalField";
import { ModalLookupField } from "../../../shared/ModalLookupField";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { QUOTATION_ENTITY } from "../../../shared/entityTypes";
import { handleSaveResult, requireFields } from "../../../shared/handleSaveResult";
import { CoaSetupReminder } from "../../../shared/CoaSetupReminder";
import { useDocumentDraft } from "../../../shared/useDocumentDraft";
import { useToast } from "../../../shared/toast";
import { buildRequiredChecksForSave, useFormFieldSettings } from "../../../shared/useFormFieldSettings";
import { CustomFieldsSection, validateCustomFields } from "../../../shared/CustomFieldsSection";
import { useCustomValues } from "../../../shared/useCustomValues";
import { WideEntityModal } from "../../../shared/WideEntityModal";
import { ModalFormGuide } from "../../../shared/ModalFormGuide";
import { LifecycleReadOnlyShell } from "../../../shared/documentLifecycle";
import { ChangeLogPanel } from "../../../shared/ChangeLogPanel";
import { HistoryLogModal } from "../../../shared/HistoryLogModal";
import { AttachmentsField } from "../../../shared/AttachmentsField";
import { uiLabel } from "../../../shared/branding/uiLabel";
import { SendEmailModal } from "../../comms/SendEmailModal";
import { EmailHistoryPanel } from "../../comms/EmailHistoryPanel";
import { fetchQuotationPrint } from "./quotationPrint";
import { hasPermission, useAuth } from "../../../shared/auth-context";
import { useProcessPolicy, policyRequiresAttachment, validateAttachmentBeforeConfirm } from "../../../shared/useProcessPolicy";
import { QuickCustomerModal } from "../../../shared/QuickCustomerModal";
import { QuickLocationModal } from "../../../shared/QuickLocationModal";
import { QuickTaxTypeModal } from "../../../shared/QuickTaxTypeModal";
import { LoadSlipMenu, QUOTATION_LOAD_SLIP_OPTIONS, filterLoadSlipOptions } from "../../../shared/LoadSlipMenu";
import { ProgressStatusMenu } from "./ProgressStatusMenu";
import {
  QuotationLineGrid,
  emptyQuotationLine,
  recalculateQuotationLines,
  type QuotationLineRow,
} from "./QuotationLineGrid";
import { defaultInputBasis, formatRateSummary, formatTaxTypeLabel } from "../../../shared/taxcalc";
import { useActiveCurrencies, useActiveTaxTypes } from "../../../shared/useDocumentLookups";
import {
  QuotationLinePickerModal,
  type PickedQuotationLine,
} from "../../sales-order/sales-order/QuotationLinePickerModal";

const RfqImportModal = lazy(() =>
  import("./RfqImportModal").then((m) => ({ default: m.RfqImportModal })),
);

export type QuotationDetail = {
  id: number;
  order_date: string;
  date_no_display: string;
  reference_no: string;
  tax_type_id: number;
  tax_type_name?: string;
  currency_id: number;
  currency_code?: string;
  partner_id: number;
  customer_name: string;
  pic_user_id?: number | null;
  pic_name: string;
  location_id: number;
  location_name?: string;
  project_id?: number | null;
  project_name?: string | null;
  quotation_validity_text?: string | null;
  validity_days?: number | null;
  valid_until?: string | null;
  payment_terms?: string | null;
  note_for_pic_only?: string | null;
  notes?: string | null;
  progress_status: string;
  voucher_status: string;
  subtotal: number;
  tax_total: number;
  grand_total: number;
  created_by_name?: string;
  custom_values?: Record<string, unknown>;
  lines?: Array<{
    line_no: number;
    item_id?: number | null;
    item_code: string;
    item_name: string;
    description?: string | null;
    qty: number;
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
  editing: QuotationDetail | null;
  /** Deleted (soft-deleted) document opened for viewing — no edits allowed. */
  readOnly?: boolean;
  onClose: () => void;
  onSaved: () => void;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function fetchPartners(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; company_name: string; partner_kind: string }[]>(`/api/v1/inventory/partners?${qs}`);
  return (res.data ?? [])
    .filter((p) => p.partner_kind === "customer" || p.partner_kind === "both")
    .map((p) => ({ id: p.id, label: p.company_name }));
}

async function fetchLocations(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; location_name: string }[]>(`/api/v1/inventory/locations?${qs}`);
  return (res.data ?? []).map((l) => ({ id: l.id, label: l.location_name }));
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

function linesFromDetail(lines?: QuotationDetail["lines"]): QuotationLineRow[] {
  if (!lines?.length) return [emptyQuotationLine(1)];
  return lines.map((ln) => ({
    line_no: ln.line_no,
    item_id: ln.item_id,
    item_code: ln.item_code ?? "",
    item_name: ln.item_name ?? "",
    description: ln.description ?? "",
    qty: ln.qty != null ? String(ln.qty) : "1",
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

export function QuotationModal(props: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const auth = useAuth();
  const canSendEmail = () => hasPermission(auth.me, "comms.send", "write");
  const processPolicy = useProcessPolicy(() => props.open);
  const [attachmentCount, setAttachmentCount] = createSignal(0);
  const taxTypesQuery = useActiveTaxTypes(() => props.open);
  const currenciesQuery = useActiveCurrencies(() => props.open);
  const taxTypes = () => taxTypesQuery.data ?? [];
  const currencies = () => currenciesQuery.data ?? [];
  const { fields, byKey, activeCustomFields } = useFormFieldSettings(QUOTATION_ENTITY.quotation);
  const { customValues, setCustom, loadCustom } = useCustomValues();
  const [saving, setSaving] = createSignal(false);
  const [createdQuotation, setCreatedQuotation] = createSignal<QuotationDetail | null>(null);
  const effectiveEditing = () => props.editing ?? createdQuotation();
  const [orderDate, setOrderDate] = createSignal(todayISO());
  const [dateNoDisplay, setDateNoDisplay] = createSignal("");
  const [referenceNo, setReferenceNo] = createSignal("");
  const [taxTypeId, setTaxTypeId] = createSignal<number | null>(null);
  const [taxTypeLabel, setTaxTypeLabel] = createSignal("");
  const [currencyId, setCurrencyId] = createSignal<number | null>(null);
  const [partnerId, setPartnerId] = createSignal<number | null>(null);
  const [customerLabel, setCustomerLabel] = createSignal("");
  const [showNewCustomer, setShowNewCustomer] = createSignal(false);
  const [showNewLocation, setShowNewLocation] = createSignal(false);
  const [newLocationName, setNewLocationName] = createSignal("");
  const [showNewTaxType, setShowNewTaxType] = createSignal(false);
  const [newTaxTypeName, setNewTaxTypeName] = createSignal("");
  const [historyOpen, setHistoryOpen] = createSignal(false);
  const [emailOpen, setEmailOpen] = createSignal(false);
  const [emailDefaultTo, setEmailDefaultTo] = createSignal("");
  const [newCustomerName, setNewCustomerName] = createSignal("");
  const [picUserId, setPicUserId] = createSignal<number | null>(null);
  const [picName, setPicName] = createSignal("");
  const [locationId, setLocationId] = createSignal<number | null>(null);
  const [locationLabel, setLocationLabel] = createSignal("");
  const [projectId, setProjectId] = createSignal<number | null>(null);
  const [projectLabel, setProjectLabel] = createSignal("");
  const [projectName, setProjectName] = createSignal("");
  const [validityText, setValidityText] = createSignal("");
  const [paymentTerms, setPaymentTerms] = createSignal("");
  const [noteForPic, setNoteForPic] = createSignal("");
  const [notes, setNotes] = createSignal("");
  const [progressStatus, setProgressStatus] = createSignal("unconfirmed");
  const [lines, setLines] = createSignal<QuotationLineRow[]>([emptyQuotationLine(1)]);
  const [rfqImportOpen, setRfqImportOpen] = createSignal(false);
  const [quotationPickerOpen, setQuotationPickerOpen] = createSignal(false);

  const selectedTaxType = () => taxTypes().find((t) => t.id === taxTypeId()) ?? null;

  createEffect(() => {
    const id = taxTypeId();
    if (id == null || taxTypeLabel()) return;
    const meta = taxTypes().find((t) => t.id === id);
    if (meta) setTaxTypeLabel(formatTaxTypeLabel(meta.name, meta.tax_mode, meta.rate_percent));
  });

  const buildDraftPayload = () => ({
    order_date: orderDate(),
    tax_type_id: taxTypeId(),
    currency_id: currencyId(),
    partner_id: partnerId(),
    customer_label: customerLabel(),
    pic_user_id: picUserId(),
    pic_name: picName(),
    location_id: locationId(),
    location_label: locationLabel(),
    project_id: projectId(),
    project_label: projectLabel(),
    project_name: projectName(),
    validity_text: validityText(),
    payment_terms: paymentTerms(),
    note_for_pic: noteForPic(),
    notes: notes(),
    progress_status: progressStatus(),
    lines: lines(),
  });

  const applyDraftPayload = (payload: ReturnType<typeof buildDraftPayload>) => {
    setOrderDate(payload.order_date);
    setTaxTypeId(payload.tax_type_id);
    setTaxTypeLabel("");
    setCurrencyId(payload.currency_id);
    setPartnerId(payload.partner_id);
    setCustomerLabel(payload.customer_label);
    setPicUserId(payload.pic_user_id);
    setPicName(payload.pic_name);
    setLocationId(payload.location_id);
    setLocationLabel(payload.location_label);
    setProjectId(payload.project_id);
    setProjectLabel(payload.project_label);
    setProjectName(payload.project_name);
    setValidityText(payload.validity_text);
    setPaymentTerms(payload.payment_terms);
    setNoteForPic(payload.note_for_pic);
    setNotes(payload.notes);
    setProgressStatus(payload.progress_status || "unconfirmed");
    setLines(payload.lines);
  };

  const draft = useDocumentDraft({
    entityType: QUOTATION_ENTITY.quotation,
    draftKey: () => (props.editing ? `edit-${props.editing.id}` : "new"),
    getPayload: buildDraftPayload,
    onApply: applyDraftPayload,
    enabled: () => props.open,
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
    const recalc = await recalculateQuotationLines(lines(), newId, meta);
    setLines(recalc);
  };

  const applyPriorQuotationLines = async (picked: PickedQuotationLine[]) => {
    if (picked.length === 0) return;
    const first = picked[0];
    setPartnerId(first.partner_id);
    setCustomerLabel(first.customer_name);
    setLocationId(first.location_id);
    setLocationLabel(first.location_name);
    setTaxTypeId(first.tax_type_id);
    setCurrencyId(first.currency_id);
    if (first.pic_name) setPicName(first.pic_name);
    const meta = taxTypes().find((t) => t.id === first.tax_type_id);
    setTaxTypeLabel(meta ? formatTaxTypeLabel(meta.name, meta.tax_mode, meta.rate_percent) : "");
    const basis = meta ? defaultInputBasis(meta.tax_mode) : "vat_inc_unit";
    const newLines: QuotationLineRow[] = picked.map((row, i) => ({
      ...emptyQuotationLine(i + 1, String(row.unit_vat_inc), basis),
      item_id: row.item_id ?? null,
      item_code: row.item_code,
      item_name: row.item_name,
      description: row.description ?? "",
      qty: String(row.balance_qty > 0 ? row.balance_qty : row.qty),
      unit_price: String(row.unit_vat_inc),
      remark: row.remark ?? "",
    }));
    if (meta && first.tax_type_id) {
      setLines(await recalculateQuotationLines(newLines, first.tax_type_id, meta));
    } else {
      setLines(newLines);
    }
  };

  const loadPreview = async (date: string) => {
    const res = await apiFetch<{ date_no_display: string; reference_no: string }>(
      `/api/v1/quotation/quotations/preview-sequences?order_date=${encodeURIComponent(date)}`,
    );
    if (res.success && res.data) {
      setDateNoDisplay(res.data.date_no_display);
      setReferenceNo(res.data.reference_no);
    }
  };

  let initializedKey: string | null = null;

  createEffect(() => {
    if (!props.open) {
      initializedKey = null;
      setCreatedQuotation(null);
      return;
    }
    const key = props.editing ? `edit-${props.editing.id}` : "new";
    if (initializedKey === key) return;
    initializedKey = key;

    const ed = props.editing;
    if (ed) {
      setOrderDate(ed.order_date);
      setDateNoDisplay(ed.date_no_display);
      setReferenceNo(ed.reference_no);
      setTaxTypeId(ed.tax_type_id);
      setTaxTypeLabel(ed.tax_type_name ?? "");
      setCurrencyId(ed.currency_id);
      setPartnerId(ed.partner_id);
      setCustomerLabel(ed.customer_name);
      setPicUserId(ed.pic_user_id ?? null);
      setPicName(ed.pic_name);
      setLocationId(ed.location_id);
      setLocationLabel(ed.location_name ?? "");
      setProjectId(ed.project_id ?? null);
      setProjectLabel(ed.project_name ?? "");
      setProjectName(ed.project_name ?? "");
      setValidityText(ed.quotation_validity_text ?? "");
      setPaymentTerms(ed.payment_terms ?? "");
      setNoteForPic(ed.note_for_pic_only ?? "");
      setNotes(ed.notes ?? "");
      setProgressStatus(ed.progress_status || "unconfirmed");
      setLines(linesFromDetail(ed.lines));
      loadCustom(ed.custom_values ?? {});
    } else {
      setOrderDate(todayISO());
      setPartnerId(null);
      setCustomerLabel("");
      setPicUserId(null);
      setPicName("");
      const branch = getActiveBranchCurrent();
      setLocationId(branch?.id ?? null);
      setLocationLabel(branch?.name ?? "");
      setProjectId(null);
      setProjectLabel("");
      setProjectName("");
      setValidityText("");
      setPaymentTerms("");
      setNoteForPic("");
      setNotes("");
      setProgressStatus("unconfirmed");
      setLines([emptyQuotationLine(1)]);
      loadCustom({});
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
      setLines([emptyQuotationLine(1, "", basis)]);
    }
    if (!currencyId()) {
      const def = cc.find((c) => c.is_default) ?? cc[0];
      if (def) setCurrencyId(def.id);
    }
  });

  createEffect(() => {
    if (props.open && !props.editing) void loadPreview(orderDate());
  });

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
    if (!partnerId()) {
      toast.warning("Please select a customer.");
      return;
    }
    if (!locationId()) {
      toast.warning("Please select a location.");
      return;
    }
    const status = (progressStatus() || "unconfirmed").trim() || "unconfirmed";
    if (progressStatus() !== status) setProgressStatus(status);
    const { checks, values: formValues } = buildRequiredChecksForSave(fields(), {
      order_date: orderDate(),
      partner_id: partnerId(),
      location_id: locationId(),
      tax_type_id: taxTypeId(),
      currency_id: currencyId(),
      pic_name: picName(),
      quotation_validity_text: validityText(),
      payment_terms: paymentTerms(),
      note_for_pic_only: noteForPic(),
      notes: notes(),
      project_id: projectId(),
      progress_status: status,
    });
    const clientError =
      requireFields(formValues, checks) ??
      validateCustomFields(customValues(), activeCustomFields());
    if (clientError) {
      toast.warning(clientError);
      return;
    }
    const attachmentErr = validateAttachmentBeforeConfirm(
      processPolicy.data,
      "quotation",
      status,
      attachmentCount(),
      effectiveEditing()?.id,
    );
    if (attachmentErr) {
      toast.warning(attachmentErr);
      return;
    }

    const body = {
      order_date: orderDate(),
      tax_type_id: taxTypeId(),
      currency_id: currencyId(),
      partner_id: partnerId(),
      pic_user_id: picUserId(),
      pic_name: picName(),
      location_id: locationId(),
      project_id: projectId(),
      project_name: projectName() || null,
      quotation_validity_text: validityText() || null,
      payment_terms: paymentTerms() || null,
      note_for_pic_only: noteForPic() || null,
      notes: notes() || null,
      progress_status: status,
      lines: lines().map((ln, i) => ({
        line_no: i + 1,
        item_id: ln.item_id || null,
        item_code: ln.item_code,
        item_name: ln.item_name,
        description: ln.description || null,
        qty: ln.qty === "" ? 0 : Number(ln.qty),
        unit_price: ln.unit_price === "" ? 0 : Number(ln.unit_price),
        input_basis: ln.input_basis,
        remark: ln.remark || null,
        planned_serial_nos: ln.planned_serial_nos ?? [],
      })),
      custom_values: customValues(),
    };

    setSaving(true);
    const ed = effectiveEditing();
    const res = await (ed
      ? apiFetch<QuotationDetail>(`/api/v1/quotation/quotations/${ed.id}`, { method: "PATCH", body: JSON.stringify(body) }, { silent: true })
      : apiFetch<QuotationDetail>("/api/v1/quotation/quotations", { method: "POST", body: JSON.stringify(body) }, { silent: true }));
    setSaving(false);
    if (!res.success || !res.data) {
      handleSaveResult(res, toast, props.editing ? "Quotation updated." : "Quotation created.");
      return;
    }
    toast.success(props.editing ? "Quotation updated." : "Quotation created.");
    await draft.clearOnSave();
    props.onSaved();
    if (props.editing) {
      props.onClose();
      return;
    }
    setCreatedQuotation(res.data);
  };

  const openEmail = async () => {
    const ed = effectiveEditing();
    if (!ed?.id) return;
    const res = await fetchQuotationPrint(ed.id);
    setEmailDefaultTo(res.data?.partner.email ?? "");
    setEmailOpen(true);
  };

  return (
    <>
    <WideEntityModal
      open={props.open}
      title={effectiveEditing() ? (props.readOnly ? "View Quotation (deleted)" : "Edit Quotation") : "New Quotation"}
      onClose={() => props.onClose()}
      onSave={() => void save()}
      readOnly={props.readOnly}
      saving={saving()}
      headerActions={
        <Show when={effectiveEditing()}>
          <Show when={canSendEmail()}>
            <button
              type="button"
              class="rounded-lg border border-stroke px-3 py-1.5 text-sm font-medium text-brand-600 hover:bg-slate-50"
              onClick={() => void openEmail()}
            >
              Email
            </button>
          </Show>
          <button type="button" class="rounded-lg border border-stroke px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-slate-50" onClick={() => setHistoryOpen(true)}>
            History
          </button>
        </Show>
      }
    >
      <LifecycleReadOnlyShell readOnly={props.readOnly ?? false}>
      <ModalFormGuide guideId="quotation" />
      <draft.DraftBanner />
      <CoaSetupReminder />
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Field label="Date-no">
        <input class={inputClass} value={dateNoDisplay()} readOnly />
      </Field>
      <Field label="Reference No.">
        <input class={inputClass} value={referenceNo()} readOnly />
      </Field>
      <ModalField settings={byKey} fieldKey="order_date" fallbackLabel="Date" fallbackRequired>
        {(m) => (
          <DateInput value={orderDate()} disabled={m.disabled} onInput={(e) => setOrderDate(e.currentTarget.value)} />
        )}
      </ModalField>
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
        fieldKey="partner_id"
        fallbackLabel="Customer"
        fallbackRequired
        value={customerLabel}
        selectedId={partnerId}
        onInput={setCustomerLabel}
        onSelect={(o) => {
          setPartnerId(o.id);
          setCustomerLabel(o.label);
        }}
        onClear={() => {
          setPartnerId(null);
          setCustomerLabel("");
        }}
        fetchOptions={fetchPartners}
        createLabel="Add customer"
        onCreate={(q) => {
          setNewCustomerName(q);
          setShowNewCustomer(true);
        }}
      />
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
        fallbackLabel="Location-Out"
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
        fetchOptions={fetchLocations}
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
      <ModalField settings={byKey} fieldKey="progress_status" fallbackLabel="Progress status">
        {(m) => <ProgressStatusMenu value={progressStatus()} disabled={m.disabled} onChange={setProgressStatus} />}
      </ModalField>
      <ModalField settings={byKey} fieldKey="quotation_validity_text" fallbackLabel="Quotation validity">
        {(m) => (
          <input
            class={inputClass}
            value={validityText()}
            placeholder={m.placeholder ?? "e.g. 30 days"}
            disabled={m.disabled}
            onInput={(e) => setValidityText(e.currentTarget.value)}
          />
        )}
      </ModalField>
      <ModalField settings={byKey} fieldKey="payment_terms" fallbackLabel="Payment terms">
        {(m) => (
          <input
            class={inputClass}
            value={paymentTerms()}
            placeholder={m.placeholder}
            disabled={m.disabled}
            onInput={(e) => setPaymentTerms(e.currentTarget.value)}
          />
        )}
      </ModalField>
      <AttachmentsField
        scope="quotation/quotations"
        formOpen={props.open}
        docId={effectiveEditing()?.id}
        label={uiLabel("selling.attachments_quotation")}
        required={policyRequiresAttachment(processPolicy.data, "quotation")}
        onCountChange={setAttachmentCount}
      />
      <ModalField settings={byKey} fieldKey="note_for_pic_only" fallbackLabel="Note for PIC only" span="full">
        {(m) => (
          <textarea
            class={inputClass}
            rows={2}
            value={noteForPic()}
            placeholder={m.placeholder}
            disabled={m.disabled}
            onInput={(e) => setNoteForPic(e.currentTarget.value)}
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
      <Show when={effectiveEditing()}>
        <Field label="Created by">
          <input class={inputClass} value={effectiveEditing()?.created_by_name ?? ""} readOnly />
        </Field>
      </Show>
      <CustomFieldsSection
        entityType={QUOTATION_ENTITY.quotation}
        values={customValues}
        onChange={setCustom}
      />
      </div>
      <div class="col-span-full mb-2 flex flex-wrap items-center gap-2">
        <LoadSlipMenu
          options={filterLoadSlipOptions(QUOTATION_LOAD_SLIP_OPTIONS, auth.me)}
          onSelect={(id) => {
            if (id === "quotation") setQuotationPickerOpen(true);
            if (id === "rfq") setRfqImportOpen(true);
          }}
        />
      </div>
      <QuotationLineGrid
        lines={lines}
        onChange={setLines}
        taxTypeId={taxTypeId}
        taxTypeMeta={() => {
          const t = selectedTaxType();
          return t ? { tax_mode: t.tax_mode, rate_percent: t.rate_percent } : null;
        }}
        locationId={locationId}
        partnerId={partnerId}
      />
      <ChangeLogPanel targetType="quo_quotation" targetId={effectiveEditing()?.id} />
      <EmailHistoryPanel docType="quotation" docId={effectiveEditing()?.id} />
      </LifecycleReadOnlyShell>
    </WideEntityModal>

    <HistoryLogModal open={historyOpen} onClose={() => setHistoryOpen(false)} targetType="quo_quotation" targetId={effectiveEditing()?.id} title="History — Quotation" />

    <QuickCustomerModal
      open={showNewCustomer()}
      initialName={newCustomerName()}
      onClose={() => setShowNewCustomer(false)}
      onCreated={(p) => {
        setPartnerId(p.id);
        setCustomerLabel(p.company_name);
      }}
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
        void recalculateQuotationLines(lines(), t.id, t).then(setLines);
      }}
    />

    <SendEmailModal
      open={emailOpen()}
      onClose={() => setEmailOpen(false)}
      title="Email quotation"
      sendUrl={`/api/v1/quotation/quotations/${effectiveEditing()?.id ?? 0}/send-email`}
      defaultTo={emailDefaultTo()}
    />

    <Show when={rfqImportOpen()}>
      <Suspense
        fallback={
          <div class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/30 p-4">
            <div class="rounded-xl bg-white px-6 py-4 text-sm text-text-secondary shadow-xl">Loading RFQ import…</div>
          </div>
        }
      >
        <RfqImportModal
          open
          partnerId={partnerId}
          onClose={() => setRfqImportOpen(false)}
          onApply={(imported) => {
            void (async () => {
              const tid = taxTypeId();
              const t = selectedTaxType();
              if (tid && t) {
                const recalc = await recalculateQuotationLines(imported, tid, {
                  tax_mode: t.tax_mode,
                  rate_percent: t.rate_percent,
                });
                setLines(recalc);
              } else {
                setLines(imported);
              }
            })();
          }}
        />
      </Suspense>
    </Show>
    <QuotationLinePickerModal
      open={quotationPickerOpen()}
      onClose={() => setQuotationPickerOpen(false)}
      onConfirm={(picked) => void applyPriorQuotationLines(picked)}
    />
    </>
  );
}
