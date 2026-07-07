import { createEffect, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { getActiveBranchCurrent } from "../../../shared/activeContext";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";
import { DateInput } from "../../../shared/DateInput";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { QUOTATION_ENTITY } from "../../../shared/entityTypes";
import { requireFields, submitEntity } from "../../../shared/handleSaveResult";
import { useDocumentDraft } from "../../../shared/useDocumentDraft";
import { useToast } from "../../../shared/toast";
import { buildRequiredChecks, useFormFieldSettings } from "../../../shared/useFormFieldSettings";
import { CustomFieldsSection, validateCustomFields } from "../../../shared/CustomFieldsSection";
import { useCustomValues } from "../../../shared/useCustomValues";
import { WideEntityModal } from "../../../shared/WideEntityModal";
import { ChangeLogPanel } from "../../../shared/ChangeLogPanel";
import { HistoryLogModal } from "../../../shared/HistoryLogModal";
import { AttachmentsField } from "../../../shared/AttachmentsField";
import { QuickCustomerModal } from "../../../shared/QuickCustomerModal";
import { ProgressStatusMenu } from "./ProgressStatusMenu";
import {
  QuotationLineGrid,
  emptyQuotationLine,
  recalculateQuotationLines,
  type QuotationLineRow,
} from "./QuotationLineGrid";
import { defaultInputBasis, formatRateSummary, formatTaxTypeLabel } from "../../../shared/taxcalc";
import type { TaxTypeRow } from "../../../shared/useTaxTypeList";

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
  }>;
};

type Props = {
  open: boolean;
  editing: QuotationDetail | null;
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

async function fetchTaxTypes(): Promise<TaxTypeRow[]> {
  const res = await apiFetch<TaxTypeRow[]>(
    "/api/v1/quotation/tax-types?page=1&pageSize=100&status=active&sort=sort_order&order=asc",
  );
  return res.data ?? [];
}

async function fetchCurrencies(): Promise<{ id: number; currency_code: string; name: string; is_default: boolean }[]> {
  const res = await apiFetch<{ id: number; currency_code: string; name: string; is_default: boolean; status: string }[]>(
    "/api/v1/quotation/currencies?page=1&pageSize=100&status=active&sort=name&order=asc",
  );
  return res.data ?? [];
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
  }));
}

export function QuotationModal(props: Props) {
  const toast = useToast();
  const { fields, activeCustomFields } = useFormFieldSettings(QUOTATION_ENTITY.quotation);
  const { customValues, setCustom, loadCustom } = useCustomValues();
  const [saving, setSaving] = createSignal(false);
  const [orderDate, setOrderDate] = createSignal(todayISO());
  const [dateNoDisplay, setDateNoDisplay] = createSignal("");
  const [referenceNo, setReferenceNo] = createSignal("");
  const [taxTypes, setTaxTypes] = createSignal<TaxTypeRow[]>([]);
  const [currencies, setCurrencies] = createSignal<{ id: number; currency_code: string; name: string; is_default: boolean }[]>([]);
  const [taxTypeId, setTaxTypeId] = createSignal<number | null>(null);
  const [currencyId, setCurrencyId] = createSignal<number | null>(null);
  const [partnerId, setPartnerId] = createSignal<number | null>(null);
  const [customerLabel, setCustomerLabel] = createSignal("");
  const [showNewCustomer, setShowNewCustomer] = createSignal(false);
  const [historyOpen, setHistoryOpen] = createSignal(false);
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

  const selectedTaxType = () => taxTypes().find((t) => t.id === taxTypeId()) ?? null;

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
    setProgressStatus(payload.progress_status);
    setLines(payload.lines);
  };

  const draft = useDocumentDraft({
    entityType: QUOTATION_ENTITY.quotation,
    draftKey: props.editing ? `edit-${props.editing.id}` : "new",
    getPayload: buildDraftPayload,
    onApply: applyDraftPayload,
    enabled: () => props.open && !props.editing,
  });

  const onTaxTypeChange = async (newId: number | null) => {
    setTaxTypeId(newId);
    const meta = taxTypes().find((t) => t.id === newId);
    if (!newId || !meta) return;
    const recalc = await recalculateQuotationLines(lines(), newId, meta);
    setLines(recalc);
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

  const loadLookups = async () => {
    const [tt, cc] = await Promise.all([fetchTaxTypes(), fetchCurrencies()]);
    setTaxTypes(tt);
    setCurrencies(cc);
    if (!props.editing) {
      if (tt.length && !taxTypeId()) {
        const first = tt[0];
        setTaxTypeId(first.id);
        const basis = defaultInputBasis(first.tax_mode);
        setLines([emptyQuotationLine(1, "", basis)]);
      }
      const def = cc.find((c) => c.is_default) ?? cc[0];
      if (def && !currencyId()) setCurrencyId(def.id);
    }
  };

  let initializedKey: string | null = null;

  createEffect(() => {
    if (!props.open) {
      initializedKey = null;
      return;
    }
    const key = props.editing ? `edit-${props.editing.id}` : "new";
    if (initializedKey === key) return;
    initializedKey = key;

    void loadLookups();
    const ed = props.editing;
    if (ed) {
      setOrderDate(ed.order_date);
      setDateNoDisplay(ed.date_no_display);
      setReferenceNo(ed.reference_no);
      setTaxTypeId(ed.tax_type_id);
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
      setProgressStatus(ed.progress_status);
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
    if (props.open && !props.editing) void loadPreview(orderDate());
  });

  const save = async () => {
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
    const formValues = {
      order_date: orderDate(),
      partner_id: partnerId(),
      location_id: locationId(),
      progress_status: progressStatus(),
    };
    const clientError =
      requireFields(formValues as Record<string, unknown>, buildRequiredChecks(fields())) ??
      validateCustomFields(customValues(), activeCustomFields());
    if (clientError) {
      toast.warning(clientError);
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
      progress_status: progressStatus(),
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
    const ed = props.editing;
    const ok = await submitEntity(
      () =>
        ed
          ? apiFetch(`/api/v1/quotation/quotations/${ed.id}`, { method: "PATCH", body: JSON.stringify(body) }, { silent: true })
          : apiFetch("/api/v1/quotation/quotations", { method: "POST", body: JSON.stringify(body) }, { silent: true }),
      toast,
      ed ? "Quotation updated." : "Quotation created.",
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
      title={props.editing ? "Edit Quotation" : "New Quotation"}
      onClose={() => props.onClose()}
      onSave={() => void save()}
      saving={saving()}
      headerActions={
        <Show when={props.editing}>
          <button type="button" class="rounded-lg border border-stroke px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-slate-50" onClick={() => setHistoryOpen(true)}>
            History
          </button>
        </Show>
      }
    >
      <draft.DraftBanner />
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Field label="Date-no">
        <input class={inputClass} value={dateNoDisplay()} readOnly />
      </Field>
      <Field label="Reference No.">
        <input class={inputClass} value={referenceNo()} readOnly />
      </Field>
      <Field label="Date *">
        <DateInput value={orderDate()} onInput={(e) => setOrderDate(e.currentTarget.value)} />
      </Field>
      <Field label="Transaction type *">
        <select
          class={inputClass}
          value={taxTypeId() ?? ""}
          onChange={(e) => void onTaxTypeChange(Number(e.currentTarget.value) || null)}
        >
          <option value="">Select…</option>
          <For each={taxTypes()}>
            {(t) => (
              <option value={t.id}>{formatTaxTypeLabel(t.name, t.tax_mode, t.rate_percent)}</option>
            )}
          </For>
        </select>
        <Show when={selectedTaxType()}>
          {(t) => (
            <p class="mt-1 text-xs text-text-secondary">{formatRateSummary(t().tax_mode, t().rate_percent)}</p>
          )}
        </Show>
      </Field>
      <Field label="Currency *">
        <select class={inputClass} value={currencyId() ?? ""} onChange={(e) => setCurrencyId(Number(e.currentTarget.value) || null)}>
          <option value="">Select…</option>
          <For each={currencies()}>{(c) => <option value={c.id}>{c.currency_code} — {c.name}</option>}</For>
        </select>
      </Field>
      <LookupCombo
        label="Customer *"
        required
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
      <LookupCombo
        label="PIC"
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
      <LookupCombo
        label="Location *"
        required
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
      />
      <Field label="Progress status">
        <ProgressStatusMenu value={progressStatus()} onChange={setProgressStatus} />
      </Field>
      <Field label="Quotation validity">
        <input class={inputClass} value={validityText()} placeholder="e.g. 30 days" onInput={(e) => setValidityText(e.currentTarget.value)} />
      </Field>
      <Field label="Payment terms">
        <input class={inputClass} value={paymentTerms()} onInput={(e) => setPaymentTerms(e.currentTarget.value)} />
      </Field>
      <AttachmentsField
        scope="quotation/quotations"
        docId={props.editing?.id}
        label="Attachments (carried to Sales Order & Sales)"
        emptyUnsavedHint="Save the quotation first to attach files (max 25 MB each)."
      />
      <Field label="Note for PIC only" span="full">
        <textarea class={inputClass} rows={2} value={noteForPic()} onInput={(e) => setNoteForPic(e.currentTarget.value)} />
      </Field>
      <Field label="Notes" span="full">
        <textarea class={inputClass} rows={2} value={notes()} onInput={(e) => setNotes(e.currentTarget.value)} />
      </Field>
      <LookupCombo
        label="Project"
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
      <Show when={props.editing}>
        <Field label="Created by">
          <input class={inputClass} value={props.editing?.created_by_name ?? ""} readOnly />
        </Field>
      </Show>
      <CustomFieldsSection
        entityType={QUOTATION_ENTITY.quotation}
        values={customValues}
        onChange={setCustom}
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
      <ChangeLogPanel targetType="quo_quotation" targetId={props.editing?.id} />
    </WideEntityModal>

    <HistoryLogModal open={historyOpen} onClose={() => setHistoryOpen(false)} targetType="quo_quotation" targetId={props.editing?.id} title="History — Quotation" />

    <QuickCustomerModal
      open={showNewCustomer()}
      initialName={newCustomerName()}
      onClose={() => setShowNewCustomer(false)}
      onCreated={(p) => {
        setPartnerId(p.id);
        setCustomerLabel(p.company_name);
      }}
    />
    </>
  );
}
