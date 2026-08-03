import { createEffect, createSignal, For, Show } from "solid-js";
import { useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../../shared/api";
import { getActiveBranchCurrent } from "../../../shared/activeContext";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";
import { DateInput } from "../../../shared/DateInput";
import { ModalField } from "../../../shared/ModalField";
import { ModalLookupField } from "../../../shared/ModalLookupField";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { SALES_ORDER_ENTITY } from "../../../shared/entityTypes";
import { handleSaveResult, requireFields } from "../../../shared/handleSaveResult";
import { CoaSetupReminder } from "../../../shared/CoaSetupReminder";
import { useDocumentDraft } from "../../../shared/useDocumentDraft";
import { useToast } from "../../../shared/toast";
import { useAuth, hasPermission } from "../../../shared/auth-context";
import { buildRequiredChecksForSave, useFormFieldSettings } from "../../../shared/useFormFieldSettings";
import { WideEntityModal } from "../../../shared/WideEntityModal";
import { ModalFormGuide } from "../../../shared/ModalFormGuide";
import { LifecycleReadOnlyShell } from "../../../shared/documentLifecycle";
import { ChangeLogPanel } from "../../../shared/ChangeLogPanel";
import { HistoryLogModal } from "../../../shared/HistoryLogModal";
import { AttachmentsField } from "../../../shared/AttachmentsField";
import { uiLabel } from "../../../shared/branding/uiLabel";
import { useProcessPolicy, policyRequiresAttachment, validateAttachmentBeforeConfirm, toastAttachmentRequired } from "../../../shared/useProcessPolicy";
import { QuickCustomerModal } from "../../../shared/QuickCustomerModal";
import { QuickLocationModal } from "../../../shared/QuickLocationModal";
import { QuickTaxTypeModal } from "../../../shared/QuickTaxTypeModal";
import { defaultInputBasis, formatRateSummary, formatTaxTypeLabel } from "../../../shared/taxcalc";
import { fetchLocationOptions, fetchPartnerOptions, useActiveCurrencies, useActiveTaxTypes } from "../../../shared/useDocumentLookups";
import { ProgressStatusMenu } from "./ProgressStatusMenu";
import { DocumentEmailToolbar } from "../../comms/DocumentEmailToolbar";
import { buildDocumentEmailSubject, buildDocumentEmailBody, firstLineItemName } from "../../comms/documentEmailSubject";
import { EmailHistoryPanel } from "../../comms/EmailHistoryPanel";
import { LoadSlipMenu, SALES_ORDER_LOAD_SLIP_OPTIONS, filterLoadSlipOptions } from "../../../shared/LoadSlipMenu";
import {
  QuotationLinePickerModal,
  type PickedQuotationLine,
} from "./QuotationLinePickerModal";
import { PurchaseRequestLinePickerModal } from "../../purchase-request/purchase-order/PurchaseRequestLinePickerModal";
import { OpenPOLinePickerModal } from "../../finance/supplier-invoices/OpenPOLinePickerModal";
import type { OpenPOLine } from "../../../shared/useSupplierInvoiceList";
import {
  SalesOrderLineGrid,
  emptySalesOrderLine,
  recalculateSalesOrderLines,
  type SalesOrderLineRow,
} from "./SalesOrderLineGrid";
import { docSeedLinePatch, takeDocSeed } from "../../../shared/docSeed";

export type SalesOrderDetail = {
  id: number;
  order_date: string;
  date_no_display: string;
  sales_order_no: string;
  tax_type_id: number;
  tax_type_name?: string;
  currency_id: number;
  currency_code?: string;
  partner_id: number;
  customer_name: string;
  pic_user_id?: number | null;
  pic_name: string;
  sales_person_id?: number | null;
  sales_person_name?: string;
  location_id: number;
  location_name?: string;
  project_id?: number | null;
  project_name?: string | null;
  due_date?: string | null;
  delivery_date?: string | null;
  delivery_date_display?: string | null;
  reference?: string | null;
  notes?: string | null;
  delivery_remarks?: string | null;
  payment_terms?: string | null;
  mop?: string | null;
  progress_status: string;
  subtotal: number;
  tax_total: number;
  grand_total: number;
  source_quotation_id?: number | null;
  created_by_name?: string;
  lines?: Array<{
    line_no: number;
    item_id?: number | null;
    item_code: string;
    item_name: string;
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
    source_quotation_line_id?: number | null;
    planned_serial_nos?: string[];
    track_serial?: boolean;
    serial_policy?: string;
  }>;
};

type Props = {
  open: boolean;
  editing: SalesOrderDetail | null;
  /** Deleted (soft-deleted) document opened for viewing — no edits allowed. */
  readOnly?: boolean;
  onClose: () => void;
  onSaved: () => void;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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

function linesFromDetail(lines?: SalesOrderDetail["lines"]): SalesOrderLineRow[] {
  if (!lines?.length) return [emptySalesOrderLine(1)];
  return lines.map((ln) => ({
    line_no: ln.line_no,
    item_id: ln.item_id,
    item_code: ln.item_code ?? "",
    item_name: ln.item_name ?? "",
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
    source_quotation_line_id: ln.source_quotation_line_id ?? null,
    planned_serial_nos: ln.planned_serial_nos ?? [],
    track_serial: Boolean(ln.track_serial),
    serial_policy: ln.serial_policy ?? "required",
  }));
}

export function SalesOrderModal(props: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const auth = useAuth();
  const processPolicy = useProcessPolicy(() => props.open);
  const [attachmentCount, setAttachmentCount] = createSignal(0);
  const taxTypesQuery = useActiveTaxTypes(() => props.open);
  const currenciesQuery = useActiveCurrencies(() => props.open);
  const taxTypes = () => taxTypesQuery.data ?? [];
  const currencies = () => currenciesQuery.data ?? [];
  const { fields, byKey } = useFormFieldSettings(SALES_ORDER_ENTITY.salesOrder);
  const [saving, setSaving] = createSignal(false);
  const [createdSalesOrder, setCreatedSalesOrder] = createSignal<SalesOrderDetail | null>(null);
  const effectiveEditing = () => props.editing ?? createdSalesOrder();
  const [quotationPickerOpen, setQuotationPickerOpen] = createSignal(false);
  const [prPickerOpen, setPrPickerOpen] = createSignal(false);
  const [poPickerOpen, setPoPickerOpen] = createSignal(false);
  const [showNewCustomer, setShowNewCustomer] = createSignal(false);
  const [showNewLocation, setShowNewLocation] = createSignal(false);
  const [newLocationName, setNewLocationName] = createSignal("");
  const [showNewTaxType, setShowNewTaxType] = createSignal(false);
  const [newTaxTypeName, setNewTaxTypeName] = createSignal("");
  const [historyOpen, setHistoryOpen] = createSignal(false);
  const [newCustomerName, setNewCustomerName] = createSignal("");
  const [orderDate, setOrderDate] = createSignal(todayISO());
  const [dateNoDisplay, setDateNoDisplay] = createSignal("");
  const [salesOrderNo, setSalesOrderNo] = createSignal("");
  const [taxTypeId, setTaxTypeId] = createSignal<number | null>(null);
  const [taxTypeLabel, setTaxTypeLabel] = createSignal("");
  const [currencyId, setCurrencyId] = createSignal<number | null>(null);
  const [partnerId, setPartnerId] = createSignal<number | null>(null);
  const [customerLabel, setCustomerLabel] = createSignal("");
  const [picUserId, setPicUserId] = createSignal<number | null>(null);
  const [picName, setPicName] = createSignal("");
  const [salesPersonId, setSalesPersonId] = createSignal<number | null>(null);
  const [salesPersonName, setSalesPersonName] = createSignal("");
  const [locationId, setLocationId] = createSignal<number | null>(null);
  const [locationLabel, setLocationLabel] = createSignal("");
  const [projectId, setProjectId] = createSignal<number | null>(null);
  const [projectLabel, setProjectLabel] = createSignal("");
  const [projectName, setProjectName] = createSignal("");
  const [dueDate, setDueDate] = createSignal("");
  const [deliveryDate, setDeliveryDate] = createSignal("");
  const [reference, setReference] = createSignal("");
  const [mop, setMop] = createSignal("");
  const [paymentTerms, setPaymentTerms] = createSignal("");
  const [deliveryRemarks, setDeliveryRemarks] = createSignal("");
  const [notes, setNotes] = createSignal("");
  const [progressStatus, setProgressStatus] = createSignal("unconfirmed");
  const [sourceQuotationId, setSourceQuotationId] = createSignal<number | null>(null);
  const [lines, setLines] = createSignal<SalesOrderLineRow[]>([emptySalesOrderLine(1)]);

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
    sales_person_id: salesPersonId(),
    sales_person_name: salesPersonName(),
    location_id: locationId(),
    location_label: locationLabel(),
    project_id: projectId(),
    project_label: projectLabel(),
    project_name: projectName(),
    due_date: dueDate(),
    delivery_date: deliveryDate(),
    reference: reference(),
    mop: mop(),
    payment_terms: paymentTerms(),
    delivery_remarks: deliveryRemarks(),
    notes: notes(),
    progress_status: progressStatus(),
    source_quotation_id: sourceQuotationId(),
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
    setSalesPersonId(payload.sales_person_id);
    setSalesPersonName(payload.sales_person_name);
    setLocationId(payload.location_id);
    setLocationLabel(payload.location_label);
    setProjectId(payload.project_id);
    setProjectLabel(payload.project_label);
    setProjectName(payload.project_name);
    setDueDate(payload.due_date);
    setDeliveryDate(payload.delivery_date);
    setReference(payload.reference);
    setMop(payload.mop);
    setPaymentTerms(payload.payment_terms);
    setDeliveryRemarks(payload.delivery_remarks);
    setNotes(payload.notes);
    setProgressStatus(payload.progress_status || "unconfirmed");
    setSourceQuotationId(payload.source_quotation_id);
    setLines(payload.lines);
  };

  const draft = useDocumentDraft({
    entityType: SALES_ORDER_ENTITY.salesOrder,
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
    const recalc = await recalculateSalesOrderLines(lines(), newId, meta);
    setLines(recalc);
  };

  const loadPreview = async (date: string) => {
    const res = await apiFetch<{ date_no_display: string; sales_order_no: string }>(
      `/api/v1/sales-order/sales-orders/preview-sequences?order_date=${encodeURIComponent(date)}`,
    );
    if (res.success && res.data) {
      setDateNoDisplay(res.data.date_no_display);
      setSalesOrderNo(res.data.sales_order_no);
    }
  };

  let seededNewLines = false;

  createEffect(() => {
    if (!props.open) {
      setCreatedSalesOrder(null);
      return;
    }
    const ed = props.editing;
    if (ed) {
      setOrderDate(ed.order_date);
      setDateNoDisplay(ed.date_no_display);
      setSalesOrderNo(ed.sales_order_no);
      setTaxTypeId(ed.tax_type_id);
      setTaxTypeLabel(ed.tax_type_name ?? "");
      setCurrencyId(ed.currency_id);
      setPartnerId(ed.partner_id);
      setCustomerLabel(ed.customer_name);
      setPicUserId(ed.pic_user_id ?? null);
      setPicName(ed.pic_name);
      setSalesPersonId(ed.sales_person_id ?? null);
      setSalesPersonName(ed.sales_person_name ?? "");
      setLocationId(ed.location_id);
      setLocationLabel(ed.location_name ?? "");
      setProjectId(ed.project_id ?? null);
      setProjectLabel(ed.project_name ?? "");
      setProjectName(ed.project_name ?? "");
      setDueDate(ed.due_date ?? "");
      setDeliveryDate(ed.delivery_date ?? "");
      setReference(ed.reference ?? "");
      setMop(ed.mop ?? "");
      setPaymentTerms(ed.payment_terms ?? "");
      setDeliveryRemarks(ed.delivery_remarks ?? "");
      setNotes(ed.notes ?? "");
      setProgressStatus(ed.progress_status || "unconfirmed");
      setSourceQuotationId(ed.source_quotation_id ?? null);
      setLines(linesFromDetail(ed.lines));
    } else {
      const seed = takeDocSeed("sales_order");
      const seedLines = (seed?.lines ?? []).slice(0, 200).map((line, index) => ({
        ...emptySalesOrderLine(index + 1),
        ...docSeedLinePatch(line),
      }));
      setOrderDate(todayISO());
      setPartnerId(seed?.partner_id ?? null);
      setCustomerLabel(seed?.partner_name ?? "");
      setPicUserId(null);
      setPicName("");
      setSalesPersonId(null);
      setSalesPersonName("");
      const branch = getActiveBranchCurrent();
      setLocationId(branch?.id ?? null);
      setLocationLabel(branch?.name ?? "");
      setProjectId(null);
      setProjectLabel("");
      setProjectName("");
      setDueDate("");
      setDeliveryDate("");
      setReference("");
      setMop("");
      setPaymentTerms("");
      setDeliveryRemarks("");
      setNotes("");
      setProgressStatus("unconfirmed");
      setSourceQuotationId(null);
      seededNewLines = seedLines.length > 0;
      if (seededNewLines) {
        setLines(seedLines);
        if (seed?.needs_qty_review) {
          toast.warning("Baiko prefilled item lines with qty 1 — review quantities before saving.");
        }
      } else {
        setLines([emptySalesOrderLine(1)]);
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
        void recalculateSalesOrderLines(seeded, first.id, first).then(setLines);
      } else {
        setLines([emptySalesOrderLine(1, "", basis)]);
      }
    }
    if (!currencyId()) {
      const def = cc.find((c) => c.is_default) ?? cc[0];
      if (def) setCurrencyId(def.id);
    }
  });

  createEffect(() => {
    if (props.open && !props.editing) void loadPreview(orderDate());
  });

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
    setSourceQuotationId(first.quotation_id);

    const meta = taxTypes().find((t) => t.id === first.tax_type_id);
    setTaxTypeLabel(meta ? formatTaxTypeLabel(meta.name, meta.tax_mode, meta.rate_percent) : "");
    const basis = meta ? defaultInputBasis(meta.tax_mode) : "vat_inc_unit";
    const newLines: SalesOrderLineRow[] = picked.map((row, i) => ({
      ...emptySalesOrderLine(i + 1, String(row.unit_vat_inc), basis),
      item_id: row.item_id ?? null,
      item_code: row.item_code,
      item_name: row.item_name,
      description: row.description ?? "",
      qty: String(row.balance_qty),
      unit_id: row.unit_id ?? null,
      unit_code: row.unit_code ?? "",
      unit_price: String(row.unit_vat_inc),
      remark: row.remark ?? "",
      source_quotation_line_id: row.source_quotation_line_id,
    }));
    if (meta && first.tax_type_id) {
      const recalc = await recalculateSalesOrderLines(newLines, first.tax_type_id, meta);
      setLines(recalc);
    } else {
      setLines(newLines);
    }
  };

  const mapBuyingOntoSalesOrder = async (
    rows: Array<{
      item_id?: number | null;
      item_code: string;
      item_name: string;
      balance_qty: number;
      unit_vat_inc: number;
      track_serial?: boolean;
    }>,
  ) => {
    if (rows.length === 0) return;
    const meta = taxTypes().find((t) => t.id === taxTypeId());
    const basis = meta ? defaultInputBasis(meta.tax_mode) : "vat_inc_unit";
    const mapped = rows.map((row, i) => ({
      ...emptySalesOrderLine(i + 1, String(row.unit_vat_inc), basis),
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
      setLines(await recalculateSalesOrderLines(merged, taxTypeId()!, meta));
    } else {
      setLines(merged);
    }
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
    const { checks, values: formValues } = buildRequiredChecksForSave(
      fields(),
      {
        order_date: orderDate(),
        partner_id: partnerId(),
        location_id: locationId(),
        tax_type_id: taxTypeId(),
        currency_id: currencyId(),
        due_date: dueDate(),
        delivery_date: deliveryDate(),
        pic_name: picName(),
        reference: reference(),
        notes: notes(),
        delivery_remarks: deliveryRemarks(),
        payment_terms: paymentTerms(),
        mop: mop(),
        project_id: projectId(),
        progress_status: status,
      },
    );
    const clientError = requireFields(formValues, checks);
    if (clientError) {
      toast.warning(clientError);
      return;
    }
    const attachmentErr = validateAttachmentBeforeConfirm(
      processPolicy.data,
      "sales_order",
      status,
      attachmentCount(),
      effectiveEditing()?.id,
    );
    if (attachmentErr) {
      toastAttachmentRequired(toast, "sales_order", attachmentErr);
      return;
    }

    const body = {
      order_date: orderDate(),
      tax_type_id: taxTypeId(),
      currency_id: currencyId(),
      partner_id: partnerId(),
      pic_user_id: picUserId(),
      pic_name: picName(),
      sales_person_id: salesPersonId(),
      location_id: locationId(),
      project_id: projectId(),
      project_name: projectName() || null,
      due_date: dueDate() || null,
      delivery_date: deliveryDate() || null,
      reference: reference() || null,
      mop: mop() || null,
      payment_terms: paymentTerms() || null,
      delivery_remarks: deliveryRemarks() || null,
      notes: notes() || null,
      progress_status: status,
      source_quotation_id: sourceQuotationId(),
      lines: lines().map((ln, i) => ({
        line_no: i + 1,
        item_id: ln.item_id || null,
        item_code: ln.item_code,
        item_name: ln.item_name,
        description: ln.description || null,
        qty: ln.qty === "" ? 0 : Number(ln.qty),
        unit_id: ln.unit_id || null,
        unit_code: ln.unit_code || null,
        unit_price: ln.unit_price === "" ? 0 : Number(ln.unit_price),
        input_basis: ln.input_basis,
        remark: ln.remark || null,
        source_quotation_line_id: ln.source_quotation_line_id || null,
        planned_serial_nos: ln.planned_serial_nos ?? [],
      })),
    };

    setSaving(true);
    const ed = effectiveEditing();
    const res = await (ed
      ? apiFetch<SalesOrderDetail>(`/api/v1/sales-order/sales-orders/${ed.id}`, { method: "PATCH", body: JSON.stringify(body) }, { silent: true })
      : apiFetch<SalesOrderDetail>("/api/v1/sales-order/sales-orders", { method: "POST", body: JSON.stringify(body) }, { silent: true }));
    setSaving(false);
    if (!res.success || !res.data) {
      handleSaveResult(res, toast, props.editing ? "Sales order updated." : "Sales order created.");
      return;
    }
    toast.success(props.editing ? "Sales order updated." : "Sales order created.");
    await draft.clearOnSave();
    props.onSaved();
    if (props.editing) {
      props.onClose();
      return;
    }
    setCreatedSalesOrder(res.data);
  };

  return (
    <>
      <WideEntityModal
        open={props.open}
        title={effectiveEditing() ? (props.readOnly ? "View Sales Order (deleted)" : "Edit Sales Order (upcoming sale)") : "New Sales Order (upcoming sale)"}
        onClose={() => props.onClose()}
        onSave={() => void save()}
        readOnly={props.readOnly}
        saving={saving()}
        headerActions={
          <Show when={effectiveEditing()}>
            <DocumentEmailToolbar
              docId={effectiveEditing()?.id}
              sendUrl="/api/v1/sales-order/sales-orders/{id}/send-email"
              title="Email sales order"
              defaultSubject={buildDocumentEmailSubject(
                firstLineItemName(lines()),
                "Sales Order",
                auth.me?.tenant.company_name,
              )}
              defaultBody={buildDocumentEmailBody({
                docTypeLabel: "Sales Order",
                partyLabel: "Customer",
                partyName: customerLabel(),
                referenceNo: salesOrderNo(),
                dateLabel: "Order date",
                date: orderDate(),
                dueDate: dueDate(),
                currencyCode: currencies().find((c) => c.id === currencyId())?.currency_code,
                grandTotal: lines().reduce((s, ln) => s + (Number(ln.line_total) || 0), 0),
                paymentTerms: paymentTerms(),
                notes: notes(),
                lines: lines(),
                companyName: auth.me?.tenant.company_name,
              })}
            />
            <button type="button" class="rounded-lg border border-stroke px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-slate-50" onClick={() => setHistoryOpen(true)}>
              History
            </button>
          </Show>
        }
      >
        <LifecycleReadOnlyShell readOnly={props.readOnly ?? false}>
        <ModalFormGuide guideId="sales_order" />
        <draft.DraftBanner />
        <CoaSetupReminder />
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Date-no">
          <input class={inputClass} value={dateNoDisplay()} readOnly />
        </Field>
        <Field label="Sales Order No.">
          <input class={inputClass} value={salesOrderNo()} readOnly />
        </Field>
        <ModalField settings={byKey} fieldKey="order_date" fallbackLabel="Date" fallbackRequired>
          {(m) => (
            <DateInput value={orderDate()} disabled={m.disabled} onInput={(e) => setOrderDate(e.currentTarget.value)} />
          )}
        </ModalField>
        <ModalField settings={byKey} fieldKey="due_date" fallbackLabel="Due date">
          {(m) => (
            <DateInput value={dueDate()} disabled={m.disabled} onInput={(e) => setDueDate(e.currentTarget.value)} />
          )}
        </ModalField>
        <ModalField settings={byKey} fieldKey="delivery_date" fallbackLabel="Delivery date">
          {(m) => (
            <DateInput value={deliveryDate()} disabled={m.disabled} onInput={(e) => setDeliveryDate(e.currentTarget.value)} />
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
          fetchOptions={(q) => fetchPartnerOptions(q, "customer")}
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
        <LookupCombo
          label="Sales person"
          value={salesPersonName}
          selectedId={salesPersonId}
          onInput={setSalesPersonName}
          onSelect={(o) => {
            setSalesPersonId(o.id);
            setSalesPersonName(o.label);
          }}
          onClear={() => {
            setSalesPersonId(null);
            setSalesPersonName("");
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
        <ModalField settings={byKey} fieldKey="progress_status" fallbackLabel="Progress status">
          {(m) => <ProgressStatusMenu value={progressStatus()} disabled={m.disabled} onChange={setProgressStatus} />}
        </ModalField>
        <ModalField settings={byKey} fieldKey="reference" fallbackLabel="Reference">
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
        <ModalField settings={byKey} fieldKey="mop" fallbackLabel="MOP">
          {(m) => (
            <input
              class={inputClass}
              value={mop()}
              placeholder={m.placeholder}
              disabled={m.disabled}
              onInput={(e) => setMop(e.currentTarget.value)}
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
          scope="sales-order/sales-orders"
          formOpen={props.open}
          docId={effectiveEditing()?.id}
          label={uiLabel("selling.attachments_sales_order")}
          required={policyRequiresAttachment(processPolicy.data, "sales_order")}
          onCountChange={setAttachmentCount}
        />
        <ModalField settings={byKey} fieldKey="delivery_remarks" fallbackLabel="Delivery remarks" span="full">
          {(m) => (
            <textarea
              class={inputClass}
              rows={2}
              value={deliveryRemarks()}
              placeholder={m.placeholder}
              disabled={m.disabled}
              onInput={(e) => setDeliveryRemarks(e.currentTarget.value)}
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
        </div>
        <div class="col-span-full mb-2">
          <LoadSlipMenu
            options={filterLoadSlipOptions(SALES_ORDER_LOAD_SLIP_OPTIONS, auth.me)}
            onSelect={(id) => {
              if (id === "quotation") setQuotationPickerOpen(true);
              if (id === "pr") setPrPickerOpen(true);
              if (id === "po") setPoPickerOpen(true);
            }}
          />
          <p class="mt-1 text-xs text-text-secondary">
            Selling and Buying sources. Quotation applies residual qty; PR/PO map item lines across modules.
          </p>
        </div>
        <SalesOrderLineGrid
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
        <ChangeLogPanel targetType="so_sales_order" targetId={effectiveEditing()?.id} />
        <EmailHistoryPanel docType="sales_order" docId={effectiveEditing()?.id} />
        </LifecycleReadOnlyShell>
      </WideEntityModal>

      <HistoryLogModal open={historyOpen} onClose={() => setHistoryOpen(false)} targetType="so_sales_order" targetId={effectiveEditing()?.id} title="History — Sales Order" />

      <QuotationLinePickerModal
        open={quotationPickerOpen()}
        onClose={() => setQuotationPickerOpen(false)}
        onConfirm={(picked) => void applyQuotationLines(picked)}
        partnerId={partnerId()}
        partnerLabel={customerLabel()}
      />

      <PurchaseRequestLinePickerModal
        open={prPickerOpen()}
        onClose={() => setPrPickerOpen(false)}
        onConfirm={(picked) =>
          void mapBuyingOntoSalesOrder(
            picked.map((r) => ({
              item_id: r.item_id,
              item_code: r.item_code,
              item_name: r.item_name,
              balance_qty: r.balance_qty,
              unit_vat_inc: r.unit_vat_inc,
              track_serial: r.track_serial,
            })),
          )
        }
      />

      <OpenPOLinePickerModal
        open={poPickerOpen()}
        mapOnly
        onClose={() => setPoPickerOpen(false)}
        onConfirm={(picked: OpenPOLine[]) => void mapBuyingOntoSalesOrder(picked)}
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
          void recalculateSalesOrderLines(lines(), t.id, t).then(setLines);
        }}
      />
    </>
  );
}
