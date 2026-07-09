import { createEffect, createSignal, For, Show } from "solid-js";
import { useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../../shared/api";
import { invalidateRecordHistory } from "../../../shared/invalidateRecordHistory";
import { getActiveBranchCurrent } from "../../../shared/activeContext";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";
import { DateInput } from "../../../shared/DateInput";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { SALES_ENTITY } from "../../../shared/entityTypes";
import { handleSaveResult, requireFields } from "../../../shared/handleSaveResult";
import { useDocumentDraft } from "../../../shared/useDocumentDraft";
import { useToast } from "../../../shared/toast";
import { buildRequiredChecks, useFormFieldSettings } from "../../../shared/useFormFieldSettings";
import { WideEntityModal } from "../../../shared/WideEntityModal";
import { ChangeLogPanel } from "../../../shared/ChangeLogPanel";
import { AttachmentsField } from "../../../shared/AttachmentsField";
import { useProcessPolicy, policyRequiresAttachment, validateAttachmentBeforeConfirm } from "../../../shared/useProcessPolicy";
import { useActiveCurrencies, useActiveTaxTypes } from "../../../shared/useDocumentLookups";
import { InvoicePanel } from "../../../shared/InvoicePanel";
import { HistoryLogModal } from "../../../shared/HistoryLogModal";
import { LoadSlipMenu, SALES_LOAD_SLIP_OPTIONS } from "../../../shared/LoadSlipMenu";
import { DocumentEmailToolbar } from "../../comms/DocumentEmailToolbar";
import { EmailHistoryPanel } from "../../comms/EmailHistoryPanel";
import { QuickCustomerModal } from "../../../shared/QuickCustomerModal";
import {
  QuotationLinePickerModal,
  type PickedQuotationLine,
} from "../../sales-order/sales-order/QuotationLinePickerModal";
import {
  ShippingOrderLinePickerModal,
  type PickedShippingSlipLine,
} from "../../shipping/ShippingOrderLinePickerModal";
import { defaultInputBasis, formatRateSummary, formatTaxTypeLabel } from "../../../shared/taxcalc";
import { ProgressStatusMenu } from "./ProgressStatusMenu";
import { SalesApprovalPanel } from "./SalesApprovalPanel";
import {
  SalesOrderLinePickerModal,
  type PickedSalesOrderLine,
} from "./SalesOrderLinePickerModal";
import {
  SalesLineGrid,
  emptySalesLine,
  recalculateSalesLines,
  type SalesLineRow,
  type SalesTemplateCode,
} from "./SalesLineGrid";
import { CashInFromCustomerModal } from "./CashInFromCustomerModal";
import { SalesPostSaveDialog } from "./SalesPostSaveDialog";

export type SalesDetail = {
  id: number;
  order_date: string;
  date_no_display: string;
  sales_no: string;
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
  due_date?: string | null;
  terms_of_payment?: string | null;
  payment_terms?: string | null;
  si_dr_no?: string | null;
  notes?: string | null;
  progress_status: string;
  invoicing_status?: boolean;
  template_code: SalesTemplateCode;
  sales_category?: string | null;
  source_sales_order_id?: number | null;
  subtotal: number;
  tax_total: number;
  grand_total: number;
  created_by_name?: string;
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
    discount_amount?: number;
    remark?: string | null;
    serial_lot_no?: string | null;
    serial_unit_ids?: number[];
    track_serial?: boolean;
    source_sales_order_line_id?: number | null;
  }>;
};

type Props = {
  open: boolean;
  editing: SalesDetail | null;
  templateCode: SalesTemplateCode;
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

function linesFromDetail(lines?: SalesDetail["lines"]): SalesLineRow[] {
  if (!lines?.length) return [emptySalesLine(1)];
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
    discount_amount: String(ln.discount_amount ?? 0),
    remark: ln.remark ?? "",
    serial_lot_no: ln.serial_lot_no ?? "",
    serial_unit_ids: ln.serial_unit_ids ?? [],
    track_serial: Boolean(ln.track_serial),
    source_sales_order_line_id: ln.source_sales_order_line_id ?? null,
  }));
}

export function SalesModal(props: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const processPolicy = useProcessPolicy(() => props.open);
  const [attachmentCount, setAttachmentCount] = createSignal(0);
  const taxTypesQuery = useActiveTaxTypes(() => props.open);
  const currenciesQuery = useActiveCurrencies(() => props.open);
  const taxTypes = () => taxTypesQuery.data ?? [];
  const currencies = () => currenciesQuery.data ?? [];
  const { fields } = useFormFieldSettings(SALES_ENTITY.sales);
  const [saving, setSaving] = createSignal(false);
  const [soPickerOpen, setSoPickerOpen] = createSignal(false);
  const [quotationPickerOpen, setQuotationPickerOpen] = createSignal(false);
  const [shippingPickerOpen, setShippingPickerOpen] = createSignal(false);
  const [createdSale, setCreatedSale] = createSignal<SalesDetail | null>(null);
  const [postSaveOpen, setPostSaveOpen] = createSignal(false);
  const [cashInOpen, setCashInOpen] = createSignal(false);
  const effectiveEditing = () => props.editing ?? createdSale();
  const [showNewCustomer, setShowNewCustomer] = createSignal(false);
  const [activeTab, setActiveTab] = createSignal<"details" | "invoice">("details");
  const [historyOpen, setHistoryOpen] = createSignal(false);
  const [newCustomerName, setNewCustomerName] = createSignal("");
  const [orderDate, setOrderDate] = createSignal(todayISO());
  const [dateNoDisplay, setDateNoDisplay] = createSignal("");
  const [salesNo, setSalesNo] = createSignal("");
  const [taxTypeId, setTaxTypeId] = createSignal<number | null>(null);
  const [currencyId, setCurrencyId] = createSignal<number | null>(null);
  const [partnerId, setPartnerId] = createSignal<number | null>(null);
  const [customerLabel, setCustomerLabel] = createSignal("");
  const [picUserId, setPicUserId] = createSignal<number | null>(null);
  const [picName, setPicName] = createSignal("");
  const [locationId, setLocationId] = createSignal<number | null>(null);
  const [locationLabel, setLocationLabel] = createSignal("");
  const [projectId, setProjectId] = createSignal<number | null>(null);
  const [projectLabel, setProjectLabel] = createSignal("");
  const [projectName, setProjectName] = createSignal("");
  const [dueDate, setDueDate] = createSignal("");
  const [termsOfPayment, setTermsOfPayment] = createSignal("");
  const [paymentTerms, setPaymentTerms] = createSignal("");
  const [siDrNo, setSiDrNo] = createSignal("");
  const [notes, setNotes] = createSignal("");
  const [progressStatus, setProgressStatus] = createSignal("unconfirmed");
  const [salesCategory, setSalesCategory] = createSignal("");
  const [sourceSalesOrderId, setSourceSalesOrderId] = createSignal<number | null>(null);
  const [lines, setLines] = createSignal<SalesLineRow[]>([emptySalesLine(1)]);

  const selectedTaxType = () => taxTypes().find((t) => t.id === taxTypeId()) ?? null;
  const templateCode = () => (props.editing?.template_code ?? props.templateCode) as SalesTemplateCode;

  const draftKey = () => (props.editing ? `edit-${props.editing.id}` : `new-${templateCode()}`);

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
    due_date: dueDate(),
    terms_of_payment: termsOfPayment(),
    payment_terms: paymentTerms(),
    si_dr_no: siDrNo(),
    notes: notes(),
    progress_status: progressStatus(),
    sales_category: salesCategory(),
    source_sales_order_id: sourceSalesOrderId(),
    template_code: templateCode(),
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
    setDueDate(payload.due_date);
    setTermsOfPayment(payload.terms_of_payment);
    setPaymentTerms(payload.payment_terms);
    setSiDrNo(payload.si_dr_no);
    setNotes(payload.notes);
    setProgressStatus(payload.progress_status);
    setSalesCategory(payload.sales_category);
    setSourceSalesOrderId(payload.source_sales_order_id);
    setLines(payload.lines);
  };

  const draft = useDocumentDraft({
    entityType: SALES_ENTITY.sales,
    draftKey: draftKey(),
    getPayload: buildDraftPayload,
    onApply: applyDraftPayload,
    enabled: () => props.open && !props.editing,
  });

  const onTaxTypeChange = async (newId: number | null) => {
    setTaxTypeId(newId);
    const meta = taxTypes().find((t) => t.id === newId);
    if (!newId || !meta) return;
    const recalc = await recalculateSalesLines(lines(), newId, meta, templateCode());
    setLines(recalc);
  };

  const loadPreview = async (date: string) => {
    const res = await apiFetch<{ date_no_display: string; sales_no: string }>(
      `/api/v1/sales/preview-sequences?order_date=${encodeURIComponent(date)}`,
    );
    if (res.success && res.data) {
      setDateNoDisplay(res.data.date_no_display);
      setSalesNo(res.data.sales_no);
    }
  };

  createEffect(() => {
    if (!props.open) {
      setCreatedSale(null);
      setPostSaveOpen(false);
      setCashInOpen(false);
      return;
    }
    const ed = props.editing;
    if (ed) {
      setOrderDate(ed.order_date);
      setDateNoDisplay(ed.date_no_display);
      setSalesNo(ed.sales_no);
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
      setDueDate(ed.due_date ?? "");
      setTermsOfPayment(ed.terms_of_payment ?? "");
      setPaymentTerms(ed.payment_terms ?? "");
      setSiDrNo(ed.si_dr_no ?? "");
      setNotes(ed.notes ?? "");
      setProgressStatus(ed.progress_status);
      setSalesCategory(ed.sales_category ?? "");
      setSourceSalesOrderId(ed.source_sales_order_id ?? null);
      setLines(linesFromDetail(ed.lines));
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
      setDueDate("");
      setTermsOfPayment("");
      setPaymentTerms("");
      setSiDrNo("");
      setNotes("");
      setProgressStatus("unconfirmed");
      setSalesCategory("");
      setSourceSalesOrderId(null);
      setLines([emptySalesLine(1)]);
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
      const basis = defaultInputBasis(first.tax_mode);
      setLines([emptySalesLine(1, "", basis)]);
    }
    if (!currencyId()) {
      const def = cc.find((c) => c.is_default) ?? cc[0];
      if (def) setCurrencyId(def.id);
    }
  });

  createEffect(() => {
    if (props.open && !props.editing) void loadPreview(orderDate());
  });

  const applySalesOrderLines = async (picked: PickedSalesOrderLine[]) => {
    if (picked.length === 0) return;
    const first = picked[0];
    setPartnerId(first.partner_id);
    setCustomerLabel(first.customer_name);
    setLocationId(first.location_id);
    setLocationLabel(first.location_name);
    setTaxTypeId(first.tax_type_id);
    setCurrencyId(first.currency_id);
    setPicName(first.pic_name);
    setSourceSalesOrderId(first.sales_order_id);

    const meta = taxTypes().find((t) => t.id === first.tax_type_id);
    const basis = meta ? defaultInputBasis(meta.tax_mode) : "vat_inc_unit";
    const newLines: SalesLineRow[] = picked.map((row, i) => ({
      ...emptySalesLine(i + 1, String(row.unit_vat_inc), basis),
      item_id: row.item_id ?? null,
      item_code: row.item_code,
      item_name: row.item_name,
      description: row.description ?? "",
      qty: String(row.balance_qty),
      unit_price: String(row.unit_vat_inc),
      remark: row.remark ?? "",
      source_sales_order_line_id: row.source_sales_order_line_id,
      track_serial: Boolean(row.track_serial),
    }));
    if (meta && first.tax_type_id) {
      const recalc = await recalculateSalesLines(newLines, first.tax_type_id, meta, templateCode());
      setLines(recalc);
    } else {
      setLines(newLines);
    }
  };

  const applyQuotationLines = async (picked: PickedQuotationLine[]) => {
    if (picked.length === 0) return;
    const first = picked[0];
    setPartnerId(first.partner_id);
    setCustomerLabel(first.customer_name);
    setLocationId(first.location_id);
    setLocationLabel(first.location_name);
    setTaxTypeId(first.tax_type_id);
    setCurrencyId(first.currency_id);
    setPicName(first.pic_name);

    const meta = taxTypes().find((t) => t.id === first.tax_type_id);
    const basis = meta ? defaultInputBasis(meta.tax_mode) : "vat_inc_unit";
    const newLines: SalesLineRow[] = picked.map((row, i) => ({
      ...emptySalesLine(i + 1, String(row.unit_vat_inc), basis),
      item_id: row.item_id ?? null,
      item_code: row.item_code,
      item_name: row.item_name,
      description: row.description ?? "",
      qty: String(row.balance_qty),
      unit_price: String(row.unit_vat_inc),
      remark: row.remark ?? "",
    }));
    if (meta && first.tax_type_id) {
      const recalc = await recalculateSalesLines(newLines, first.tax_type_id, meta, templateCode());
      setLines(recalc);
    } else {
      setLines(newLines);
    }
  };

  const applyShippingLines = async (picked: PickedShippingSlipLine[]) => {
    if (picked.length === 0) return;
    const first = picked[0];
    setPartnerId(first.partner_id);
    setCustomerLabel(first.customer_name);
    setLocationId(first.location_id);
    setLocationLabel(first.location_name);
    setTaxTypeId(first.tax_type_id);
    setCurrencyId(first.currency_id);
    setPicName(first.pic_name);
    setSourceSalesOrderId(first.sales_order_id);

    const meta = taxTypes().find((t) => t.id === first.tax_type_id);
    const basis = meta ? defaultInputBasis(meta.tax_mode) : "vat_inc_unit";
    const newLines: SalesLineRow[] = picked.map((row, i) => ({
      ...emptySalesLine(i + 1, String(row.unit_vat_inc), basis),
      item_id: row.item_id ?? null,
      item_code: row.item_code,
      item_name: row.item_name,
      description: row.description ?? "",
      qty: String(row.balance_qty),
      unit_price: String(row.unit_vat_inc),
      remark: row.remark ?? "",
      source_sales_order_line_id: row.source_sales_order_line_id,
      track_serial: Boolean(row.track_serial),
    }));
    if (meta && first.tax_type_id) {
      const recalc = await recalculateSalesLines(newLines, first.tax_type_id, meta, templateCode());
      setLines(recalc);
    } else {
      setLines(newLines);
    }
  };

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
      tax_type_id: taxTypeId(),
      currency_id: currencyId(),
      due_date: dueDate(),
      pic_name: picName(),
      si_dr_no: siDrNo(),
      payment_terms: paymentTerms(),
      notes: notes(),
      project_id: projectId(),
      progress_status: progressStatus(),
    };
    const clientError = requireFields(formValues as Record<string, unknown>, buildRequiredChecks(fields()));
    if (clientError) {
      toast.warning(clientError);
      return;
    }
    const attachmentErr = validateAttachmentBeforeConfirm(
      processPolicy.data,
      "sales",
      progressStatus(),
      attachmentCount(),
      props.editing?.id ?? createdSale()?.id,
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
      due_date: dueDate() || null,
      terms_of_payment: termsOfPayment() || null,
      payment_terms: paymentTerms() || null,
      si_dr_no: siDrNo() || null,
      notes: notes() || null,
      progress_status: progressStatus(),
      template_code: templateCode(),
      sales_category: salesCategory() || null,
      source_sales_order_id: sourceSalesOrderId(),
      lines: lines().map((ln, i) => ({
        line_no: i + 1,
        item_id: ln.item_id || null,
        item_code: ln.item_code,
        item_name: ln.item_name,
        description: ln.description || null,
        qty: ln.qty === "" ? 0 : Number(ln.qty),
        unit_price: ln.unit_price === "" ? 0 : Number(ln.unit_price),
        input_basis: ln.input_basis,
        discount_amount: ln.discount_amount === "" ? 0 : Number(ln.discount_amount),
        remark: ln.remark || null,
        serial_lot_no: ln.serial_lot_no || null,
        serial_unit_ids: ln.serial_unit_ids?.length ? ln.serial_unit_ids : undefined,
        source_sales_order_line_id: ln.source_sales_order_line_id || null,
      })),
    };

    setSaving(true);
    const ed = props.editing;
    const res = await (ed
      ? apiFetch<SalesDetail>(`/api/v1/sales/${ed.id}`, { method: "PATCH", body: JSON.stringify(body) }, { silent: true })
      : apiFetch<SalesDetail>("/api/v1/sales", { method: "POST", body: JSON.stringify(body) }, { silent: true }));
    setSaving(false);
    if (!res.success || !res.data) {
      handleSaveResult(res, toast, ed ? "Sales updated." : "Sales created.");
      return;
    }
    toast.success(ed ? "Sales updated." : "Sales created.");
    if (ed?.id) {
      invalidateRecordHistory(queryClient, "sa_sales", ed.id);
    }
    await draft.clearOnSave();
    props.onSaved();
    if (ed) {
      props.onClose();
      return;
    }
    setCreatedSale(res.data);
    setPostSaveOpen(true);
  };

  const finishPostSave = () => {
    setPostSaveOpen(false);
    props.onClose();
  };

  return (
    <>
      <WideEntityModal
        open={props.open}
        title={effectiveEditing() ? "Edit Sale (actual sale)" : "New Sale (actual sale)"}
        onClose={() => props.onClose()}
        onSave={activeTab() === "details" ? () => void save() : undefined}
        saving={saving()}
        tabs={effectiveEditing() ? [{ id: "details", label: "Details" }, { id: "invoice", label: "Invoice" }] : undefined}
        activeTab={activeTab()}
        onTabChange={(id) => setActiveTab(id as "details" | "invoice")}
        headerActions={
          <Show when={effectiveEditing()}>
            <DocumentEmailToolbar
              docId={effectiveEditing()?.id}
              sendUrl="/api/v1/sales/{id}/send-email"
              title="Email sales invoice"
            />
            <button
              type="button"
              class="rounded-lg border border-stroke px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-slate-50"
              onClick={() => setHistoryOpen(true)}
            >
              History
            </button>
          </Show>
        }
      >
        <Show when={activeTab() === "invoice"}>
          <InvoicePanel
            kind="sales"
            docId={effectiveEditing()?.id}
            attachmentsScope="sales"
            onPrint={() => effectiveEditing() && window.open(`/app/sales/sales/${effectiveEditing()!.id}/invoice/print`, "_blank", "noopener,noreferrer")}
          />
        </Show>
        <Show when={activeTab() === "details"}>
        <draft.DraftBanner />
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Date-no">
          <input class={inputClass} value={dateNoDisplay()} readOnly />
        </Field>
        <Field label="Sales No.">
          <input class={inputClass} value={salesNo()} readOnly />
        </Field>
        <Field label="Date *">
          <DateInput value={orderDate()} onInput={(e) => setOrderDate(e.currentTarget.value)} />
        </Field>
        <Field label="Due date">
          <DateInput value={dueDate()} onInput={(e) => setDueDate(e.currentTarget.value)} />
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
          <ProgressStatusMenu
            value={progressStatus()}
            onChange={setProgressStatus}
            disabled={progressStatus() === "e_approval"}
          />
        </Field>
        <Field label="SI/DR No.">
          <input class={inputClass} value={siDrNo()} onInput={(e) => setSiDrNo(e.currentTarget.value)} />
        </Field>
        <Field label="Terms of payment">
          <select class={inputClass} value={termsOfPayment()} onChange={(e) => setTermsOfPayment(e.currentTarget.value)}>
            <option value="">—</option>
            <option value="30_days_terms">30 Days Terms</option>
            <option value="cash">Cash</option>
          </select>
        </Field>
        <Field label="Payment terms">
          <input class={inputClass} value={paymentTerms()} onInput={(e) => setPaymentTerms(e.currentTarget.value)} />
        </Field>
        <AttachmentsField
          scope="sales"
          docId={props.editing?.id ?? createdSale()?.id}
          label="Attachments (carried from Quotation/Sales Order)"
          required={policyRequiresAttachment(processPolicy.data, "sales")}
          onCountChange={setAttachmentCount}
          emptyUnsavedHint="Save the sale first to attach files (max 25 MB each)."
        />
        <Field label="Sales category">
          <select class={inputClass} value={salesCategory()} onChange={(e) => setSalesCategory(e.currentTarget.value)}>
            <option value="">—</option>
            <option value="general">General</option>
            <option value="returns">Returns</option>
          </select>
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
        </div>
        <div class="col-span-full mb-2">
          <LoadSlipMenu
            disabled={!partnerId()}
            options={SALES_LOAD_SLIP_OPTIONS}
            onSelect={(id) => {
              if (id === "so") setSoPickerOpen(true);
              if (id === "quotation") setQuotationPickerOpen(true);
              if (id === "shipping") setShippingPickerOpen(true);
            }}
          />
        </div>
        <SalesLineGrid
          lines={lines}
          onChange={setLines}
          taxTypeId={taxTypeId}
          taxTypeMeta={() => {
            const t = selectedTaxType();
            return t ? { tax_mode: t.tax_mode, rate_percent: t.rate_percent } : null;
          }}
          locationId={locationId}
          templateCode={templateCode}
          partnerId={partnerId}
        />
        <Show when={effectiveEditing()?.id}>
          <SalesApprovalPanel
            salesId={effectiveEditing()!.id}
            progressStatus={progressStatus()}
            onChanged={() => {
              void (async () => {
                const res = await apiFetch<SalesDetail>(`/api/v1/sales/${effectiveEditing()!.id}`);
                if (res.success && res.data) {
                  setProgressStatus(res.data.progress_status);
                  props.onSaved();
                }
              })();
            }}
          />
        </Show>
        <ChangeLogPanel targetType="sa_sales" targetId={effectiveEditing()?.id} />
        <EmailHistoryPanel docType="sales" docId={effectiveEditing()?.id} />
        </Show>
      </WideEntityModal>

      <HistoryLogModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        targetType="sa_sales"
        targetId={effectiveEditing()?.id}
        title={effectiveEditing() ? `History — Sale ${effectiveEditing()!.sales_no}` : "History"}
      />

      <SalesPostSaveDialog
        open={postSaveOpen()}
        salesNo={createdSale()?.sales_no ?? ""}
        amount={createdSale()?.grand_total ?? 0}
        onCashIn={() => {
          setPostSaveOpen(false);
          setCashInOpen(true);
        }}
        onAccounting={() => {
          setPostSaveOpen(false);
          setActiveTab("invoice");
        }}
        onDone={finishPostSave}
      />

      <Show when={createdSale()}>
        {(sale) => (
          <CashInFromCustomerModal
            open={cashInOpen()}
            salesId={sale().id}
            partnerId={sale().partner_id}
            currencyId={sale().currency_id}
            amount={sale().grand_total}
            salesNo={sale().sales_no}
            receiptDate={sale().order_date}
            onClose={() => {
              setCashInOpen(false);
              finishPostSave();
            }}
            onSaved={() => props.onSaved()}
          />
        )}
      </Show>

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

      <ShippingOrderLinePickerModal
        open={shippingPickerOpen()}
        partnerId={partnerId()}
        onClose={() => setShippingPickerOpen(false)}
        onConfirm={(picked) => void applyShippingLines(picked)}
      />

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
