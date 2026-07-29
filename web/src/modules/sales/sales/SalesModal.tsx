import { createEffect, createSignal, For, Show } from "solid-js";
import { useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../../shared/api";
import { invalidateRecordHistory } from "../../../shared/invalidateRecordHistory";
import { getActiveBranchCurrent } from "../../../shared/activeContext";
import type { LookupOption } from "../../../shared/LookupCombo";
import { DateInput } from "../../../shared/DateInput";
import { ModalField } from "../../../shared/ModalField";
import { ModalLookupField } from "../../../shared/ModalLookupField";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { SALES_ENTITY } from "../../../shared/entityTypes";
import { handleSaveResult, requireFields } from "../../../shared/handleSaveResult";
import { CoaSetupReminder } from "../../../shared/CoaSetupReminder";
import { useDocumentDraft } from "../../../shared/useDocumentDraft";
import { useToast } from "../../../shared/toast";
import { buildRequiredChecksForSave, useFormFieldSettings } from "../../../shared/useFormFieldSettings";
import { WideEntityModal } from "../../../shared/WideEntityModal";
import { ModuleIcon } from "../../../shell/ModuleIcon";
import { LifecycleReadOnlyShell } from "../../../shared/documentLifecycle";
import { ChangeLogPanel } from "../../../shared/ChangeLogPanel";
import { AttachmentsField } from "../../../shared/AttachmentsField";
import { uiLabel } from "../../../shared/branding/uiLabel";
import { useProcessPolicy, policyRequiresAttachment, validateAttachmentBeforeConfirm } from "../../../shared/useProcessPolicy";
import { fetchLocationOptions, fetchPartnerOptions, useActiveCurrencies, useActiveTaxTypes } from "../../../shared/useDocumentLookups";
import { InvoicePanel } from "../../../shared/InvoicePanel";
import { openSalesInvoicePrint } from "../../../shared/invoiceDocumentPrint";
import { tryAutoSaveSalesInvoice } from "../../../shared/invoiceApi";
import { HistoryLogModal } from "../../../shared/HistoryLogModal";
import { LoadSlipMenu, SALES_LOAD_SLIP_OPTIONS, filterLoadSlipOptions } from "../../../shared/LoadSlipMenu";
import { DocumentEmailToolbar } from "../../comms/DocumentEmailToolbar";
import { buildDocumentEmailSubject, buildDocumentEmailBody, firstLineItemName } from "../../comms/documentEmailSubject";
import { EmailHistoryPanel } from "../../comms/EmailHistoryPanel";
import { QuickCustomerModal } from "../../../shared/QuickCustomerModal";
import { QuickLocationModal } from "../../../shared/QuickLocationModal";
import { QuickTaxTypeModal } from "../../../shared/QuickTaxTypeModal";
import { ModalFormGuide } from "../../../shared/ModalFormGuide";
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
import { PurchaseRequestLinePickerModal, type PickedPurchaseRequestLine } from "../../purchase-request/purchase-order/PurchaseRequestLinePickerModal";
import { OpenPOLinePickerModal } from "../../finance/supplier-invoices/OpenPOLinePickerModal";
import { OpenGRLinePickerModal } from "../../finance/supplier-invoices/OpenGRLinePickerModal";
import type { OpenGRLine, OpenPOLine } from "../../../shared/useSupplierInvoiceList";
import {
  SalesLineGrid,
  emptySalesLine,
  recalculateSalesLines,
  type SalesLineRow,
  type SalesTemplateCode,
} from "./SalesLineGrid";
import { docSeedLinePatch, takeDocSeed } from "../../../shared/docSeed";
import { CashInFromCustomerModal } from "./CashInFromCustomerModal";
import { SalesPostSaveDialog } from "./SalesPostSaveDialog";
import { SalesHoldListModal, type SalesHoldPayload } from "./SalesHoldListModal";
import { ReturnSaleLinesModal } from "./ReturnSaleLinesModal";
import { hasPermission, useAuth } from "../../../shared/auth-context";
import {
  SalesCommissionPanel,
  type SaleCommissionRow,
} from "./SalesCommissionPanel";

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
    id?: number;
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
    discount_amount?: number;
    remark?: string | null;
    serial_lot_no?: string | null;
    serial_unit_ids?: number[];
    track_serial?: boolean;
    source_sales_order_line_id?: number | null;
  }>;
  commissions?: Array<{
    id?: number;
    line_no: number;
    tic_user_id?: number | null;
    tic_name: string;
    calc_mode: "percent" | "fixed";
    rate_value: number;
    base_amount?: number;
    commission_amount?: number;
    notes?: string | null;
    scope?: "transaction" | "item";
    sales_line_id?: number | null;
    sales_line_no?: number | null;
  }>;
};

type Props = {
  open: boolean;
  editing: SalesDetail | null;
  templateCode: SalesTemplateCode;
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

function linesFromDetail(lines?: SalesDetail["lines"]): SalesLineRow[] {
  if (!lines?.length) return [emptySalesLine(1)];
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
    discount_amount: String(ln.discount_amount ?? 0),
    remark: ln.remark ?? "",
    serial_lot_no: ln.serial_lot_no ?? "",
    serial_unit_ids: ln.serial_unit_ids ?? [],
    track_serial: Boolean(ln.track_serial),
    track_lot: Boolean((ln as { track_lot?: boolean }).track_lot),
    serial_policy: (ln as { serial_policy?: string }).serial_policy ?? "required",
    lot_policy: (ln as { lot_policy?: string }).lot_policy ?? "required",
    lot_batch_id: (ln as { lot_batch_id?: number | null }).lot_batch_id ?? null,
    lot_no: (ln as { serial_lot_no?: string | null }).serial_lot_no ?? "",
    source_sales_order_line_id: ln.source_sales_order_line_id ?? null,
  }));
}

export function SalesModal(props: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const auth = useAuth();
  const processPolicy = useProcessPolicy(() => props.open);
  const [attachmentCount, setAttachmentCount] = createSignal(0);
  const taxTypesQuery = useActiveTaxTypes(() => props.open);
  const currenciesQuery = useActiveCurrencies(() => props.open);
  const taxTypes = () => taxTypesQuery.data ?? [];
  const currencies = () => currenciesQuery.data ?? [];
  const { fields, byKey } = useFormFieldSettings(SALES_ENTITY.sales);
  const [saving, setSaving] = createSignal(false);
  const [soPickerOpen, setSoPickerOpen] = createSignal(false);
  const [quotationPickerOpen, setQuotationPickerOpen] = createSignal(false);
  const [shippingPickerOpen, setShippingPickerOpen] = createSignal(false);
  const [prPickerOpen, setPrPickerOpen] = createSignal(false);
  const [poPickerOpen, setPoPickerOpen] = createSignal(false);
  const [grPickerOpen, setGrPickerOpen] = createSignal(false);
  const [createdSale, setCreatedSale] = createSignal<SalesDetail | null>(null);
  const [postSaveOpen, setPostSaveOpen] = createSignal(false);
  const [cashInOpen, setCashInOpen] = createSignal(false);
  const [holdOpen, setHoldOpen] = createSignal(false);
  const effectiveEditing = () => props.editing ?? createdSale();
  const [showNewCustomer, setShowNewCustomer] = createSignal(false);
  const [showNewLocation, setShowNewLocation] = createSignal(false);
  const [newLocationName, setNewLocationName] = createSignal("");
  const [showNewTaxType, setShowNewTaxType] = createSignal(false);
  const [newTaxTypeName, setNewTaxTypeName] = createSignal("");
  const [activeTab, setActiveTab] = createSignal<"details" | "invoice">("details");
  const [historyOpen, setHistoryOpen] = createSignal(false);
  const [returnLinesOpen, setReturnLinesOpen] = createSignal(false);
  const [returningLines, setReturningLines] = createSignal(false);
  const [detailLines, setDetailLines] = createSignal<NonNullable<SalesDetail["lines"]>>([]);
  const [newCustomerName, setNewCustomerName] = createSignal("");
  const [orderDate, setOrderDate] = createSignal(todayISO());
  const [dateNoDisplay, setDateNoDisplay] = createSignal("");
  const [salesNo, setSalesNo] = createSignal("");
  const [taxTypeId, setTaxTypeId] = createSignal<number | null>(null);
  const [taxTypeLabel, setTaxTypeLabel] = createSignal("");
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
  const [commissions, setCommissions] = createSignal<SaleCommissionRow[]>([]);

  const selectedTaxType = () => taxTypes().find((t) => t.id === taxTypeId()) ?? null;
  const templateCode = () => (props.editing?.template_code ?? props.templateCode) as SalesTemplateCode;

  /** Fill label when id is set but label still empty (e.g. after draft restore before list loads). */
  createEffect(() => {
    const id = taxTypeId();
    if (id == null || taxTypeLabel()) return;
    const meta = taxTypes().find((t) => t.id === id);
    if (meta) setTaxTypeLabel(formatTaxTypeLabel(meta.name, meta.tax_mode, meta.rate_percent));
  });

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
    commissions: commissions(),
  });

  const buildHoldPayload = (): SalesHoldPayload => {
    const d = buildDraftPayload();
    return {
      order_date: d.order_date,
      tax_type_id: d.tax_type_id,
      currency_id: d.currency_id,
      partner_id: d.partner_id,
      location_id: d.location_id,
      location_label: d.location_label,
      customer_label: d.customer_label,
      pic_user_id: d.pic_user_id,
      pic_name: d.pic_name,
      project_id: d.project_id,
      project_label: d.project_label,
      project_name: d.project_name,
      due_date: d.due_date,
      terms_of_payment: d.terms_of_payment,
      payment_terms: d.payment_terms,
      si_dr_no: d.si_dr_no,
      notes: d.notes,
      progress_status: d.progress_status,
      template_code: d.template_code,
      sales_category: d.sales_category,
      source_sales_order_id: d.source_sales_order_id,
      lines: d.lines,
    };
  };

  const holdGrandTotal = () => lines().reduce((s, ln) => s + (Number(ln.line_total) || 0), 0);

  const canReturnLines = () =>
    Boolean(props.editing?.id) && hasPermission(auth.me, "sales.sales_return", "write");

  const returnableLines = () =>
    detailLines()
      .filter((ln): ln is NonNullable<SalesDetail["lines"]>[number] & { id: number } => typeof ln.id === "number")
      .map((ln) => ({
        id: ln.id,
        line_no: ln.line_no,
        item_code: ln.item_code,
        item_name: ln.item_name,
        qty: ln.qty,
        line_total: ln.line_total,
      }));

  const hydrateFromDetail = (ed: SalesDetail) => {
    setOrderDate(ed.order_date);
    setDateNoDisplay(ed.date_no_display);
    setSalesNo(ed.sales_no);
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
    setDueDate(ed.due_date ?? "");
    setTermsOfPayment(ed.terms_of_payment ?? "");
    setPaymentTerms(ed.payment_terms ?? "");
    setSiDrNo(ed.si_dr_no ?? "");
    setNotes(ed.notes ?? "");
    setProgressStatus(ed.progress_status || "unconfirmed");
    setSalesCategory(ed.sales_category ?? "");
    setSourceSalesOrderId(ed.source_sales_order_id ?? null);
    setLines(linesFromDetail(ed.lines));
    setDetailLines(ed.lines ?? []);
    setCommissions(
      (ed.commissions ?? []).map((c, i) => ({
        line_no: c.line_no || i + 1,
        tic_user_id: c.tic_user_id ?? null,
        tic_name: c.tic_name ?? "",
        calc_mode: c.calc_mode === "fixed" ? "fixed" : "percent",
        rate_value: c.rate_value != null ? String(c.rate_value) : "",
        notes: c.notes ?? "",
        scope: c.scope === "item" ? "item" : "transaction",
        sales_line_no: c.sales_line_no ?? null,
        sales_line_id: c.sales_line_id ?? null,
      })),
    );
  };

  const returnSelectedLines = async (lineIds: number[]) => {
    const saleId = props.editing?.id;
    if (!saleId) return;
    if (
      !window.confirm(
        `Return ${lineIds.length} line(s) from ${props.editing?.sales_no ?? "this sale"}? Stock will be reversed and lines removed.`,
      )
    ) {
      return;
    }
    setReturningLines(true);
    const res = await apiFetch<SalesDetail>(`/api/v1/sales/${saleId}/return-lines`, {
      method: "POST",
      body: JSON.stringify({ line_ids: lineIds }),
    });
    setReturningLines(false);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? "Failed to return lines.");
      return;
    }
    toast.success(res.message ?? "Lines returned.");
    setReturnLinesOpen(false);
    hydrateFromDetail(res.data);
    invalidateRecordHistory(queryClient, "sa_sales", saleId);
    props.onSaved();
  };

  const loadHoldPayload = (payload: SalesHoldPayload) => {
    applyDraftPayload({
      ...payload,
      customer_label: payload.customer_label,
      location_label: payload.location_label ?? "",
      project_label: payload.project_label ?? "",
      commissions: [],
    });
  };

  const createShippingFromLine = async (line: SalesLineRow) => {
    if (!line.source_sales_order_line_id) {
      toast.warning("Line must be linked to a sales order.");
      return;
    }
    if (!partnerId() || !locationId()) {
      toast.warning("Select customer and location first.");
      return;
    }
    const qty = line.qty === "" ? 0 : Number(line.qty);
    if (qty <= 0) {
      toast.warning("Enter a quantity before creating a shipping order.");
      return;
    }
    const res = await apiFetch<{ shipping_no: string }>("/api/v1/shipping/orders/from-lines", {
      method: "POST",
      body: JSON.stringify({
        shipping_date: orderDate(),
        partner_id: partnerId(),
        location_id: locationId(),
        lines: [{ sales_order_line_id: line.source_sales_order_line_id, qty }],
      }),
    });
    if (!res.success || !res.data) {
      toast.warning(res.message ?? "Failed to create shipping order.");
      return;
    }
    toast.success(`Shipping order ${res.data.shipping_no} created.`);
  };

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
    setDueDate(payload.due_date);
    setTermsOfPayment(payload.terms_of_payment);
    setPaymentTerms(payload.payment_terms);
    setSiDrNo(payload.si_dr_no);
    setNotes(payload.notes);
    setProgressStatus(payload.progress_status || "unconfirmed");
    setSalesCategory(payload.sales_category);
    setSourceSalesOrderId(payload.source_sales_order_id);
    setLines(payload.lines);
    setCommissions((payload.commissions as SaleCommissionRow[] | undefined) ?? []);
  };

  const draft = useDocumentDraft({
    entityType: SALES_ENTITY.sales,
    draftKey,
    getPayload: buildDraftPayload,
    onApply: applyDraftPayload,
    enabled: () => props.open,
    // Banner-only: show Restore/Discard so the user chooses (ECOUNT-style recovery).
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

  let seededNewLines = false;

  createEffect(() => {
    if (!props.open) {
      setCreatedSale(null);
      setPostSaveOpen(false);
      setCashInOpen(false);
      setActiveTab("details");
      return;
    }
    const ed = props.editing;
    if (ed) {
      hydrateFromDetail(ed);
      setActiveTab("details");
    } else if (!createdSale()) {
      const seed = takeDocSeed("sales");
      const seedLines = (seed?.lines ?? []).slice(0, 200).map((line, index) => ({
        ...emptySalesLine(index + 1),
        ...docSeedLinePatch(line),
      }));
      setOrderDate(todayISO());
      setPartnerId(seed?.partner_id ?? null);
      setCustomerLabel(seed?.partner_name ?? "");
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
      seededNewLines = seedLines.length > 0;
      if (seededNewLines) {
        setLines(seedLines);
        if (seed?.needs_qty_review) {
          toast.warning("Copilot prefilled item lines with qty 1 — review quantities before saving.");
        }
      } else {
        setLines([emptySalesLine(1)]);
      }
      setCommissions([]);
      setActiveTab("details");
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
        void recalculateSalesLines(seeded, first.id, first, templateCode()).then(setLines);
      } else {
        setLines([emptySalesLine(1, "", basis)]);
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
    setTaxTypeLabel(meta ? formatTaxTypeLabel(meta.name, meta.tax_mode, meta.rate_percent) : "");
    const basis = meta ? defaultInputBasis(meta.tax_mode) : "vat_inc_unit";
    const newLines: SalesLineRow[] = picked.map((row, i) => ({
      ...emptySalesLine(i + 1, String(row.unit_vat_inc), basis),
      item_id: row.item_id ?? null,
      item_code: row.item_code,
      item_name: row.item_name,
      description: row.description ?? "",
      qty: String(row.balance_qty),
      unit_id: row.unit_id ?? null,
      unit_code: row.unit_code ?? "",
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
    toast.success("Sales Order lines loaded. Click Save to create the sales invoice — the Invoice tab opens after save.");
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
    setTaxTypeLabel(meta ? formatTaxTypeLabel(meta.name, meta.tax_mode, meta.rate_percent) : "");
    const basis = meta ? defaultInputBasis(meta.tax_mode) : "vat_inc_unit";
    const newLines: SalesLineRow[] = picked.map((row, i) => ({
      ...emptySalesLine(i + 1, String(row.unit_vat_inc), basis),
      item_id: row.item_id ?? null,
      item_code: row.item_code,
      item_name: row.item_name,
      description: row.description ?? "",
      qty: String(row.balance_qty),
      unit_id: row.unit_id ?? null,
      unit_code: row.unit_code ?? "",
      unit_price: String(row.unit_vat_inc),
      remark: row.remark ?? "",
    }));
    if (meta && first.tax_type_id) {
      const recalc = await recalculateSalesLines(newLines, first.tax_type_id, meta, templateCode());
      setLines(recalc);
    } else {
      setLines(newLines);
    }
    toast.success("Quotation lines loaded. Click Save to create the sales invoice — the Invoice tab opens after save.");
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
    setTaxTypeLabel(meta ? formatTaxTypeLabel(meta.name, meta.tax_mode, meta.rate_percent) : "");
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
    toast.success("Shipping Order lines loaded. Click Save to create the sales invoice — the Invoice tab opens after save.");
  };

  /** Cross-side map: copy item/qty only — never adopt vendor as customer or consume buying residual FKs. */
  const mapBuyingLinesOntoSale = async (
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
    const start = lines().filter((ln) => ln.item_id || ln.item_code).length;
    const mapped: SalesLineRow[] = rows.map((row, i) => ({
      ...emptySalesLine(start + i + 1, String(row.unit_vat_inc), basis),
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
      setLines(await recalculateSalesLines(merged, taxTypeId()!, meta, templateCode()));
    } else {
      setLines(merged);
    }
  };

  const applyMappedPrLines = async (picked: PickedPurchaseRequestLine[]) => {
    await mapBuyingLinesOntoSale(
      picked.map((r) => ({
        item_id: r.item_id,
        item_code: r.item_code,
        item_name: r.item_name,
        balance_qty: r.balance_qty,
        unit_vat_inc: r.unit_vat_inc,
        track_serial: r.track_serial,
      })),
    );
  };

  const applyMappedPoLines = async (picked: OpenPOLine[]) => {
    await mapBuyingLinesOntoSale(picked);
  };

  const applyMappedGrLines = async (picked: OpenGRLine[]) => {
    await mapBuyingLinesOntoSale(
      picked.map((r) => ({
        item_id: r.item_id,
        item_code: r.item_code,
        item_name: r.item_name,
        balance_qty: r.balance_qty,
        unit_vat_inc: r.unit_vat_inc,
      })),
    );
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
        pic_name: picName(),
        si_dr_no: siDrNo(),
        payment_terms: paymentTerms(),
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
    const attachmentErr = validateAttachmentBeforeConfirm(
      processPolicy.data,
      "sales",
      status,
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
      progress_status: status,
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
        unit_id: ln.unit_id || null,
        unit_code: ln.unit_code || null,
        unit_price: ln.unit_price === "" ? 0 : Number(ln.unit_price),
        input_basis: ln.input_basis,
        discount_amount: ln.discount_amount === "" ? 0 : Number(ln.discount_amount),
        remark: ln.remark || null,
        serial_lot_no: ln.serial_lot_no || null,
        serial_unit_ids: ln.serial_unit_ids?.length ? ln.serial_unit_ids : undefined,
        lot_batch_id: ln.lot_batch_id ?? null,
        source_sales_order_line_id: ln.source_sales_order_line_id || null,
      })),
      commissions: commissions()
        .filter((c) => c.tic_name.trim() || (c.tic_user_id != null && c.tic_user_id > 0))
        .map((c, i) => ({
          line_no: i + 1,
          tic_user_id: c.tic_user_id || null,
          tic_name: c.tic_name.trim(),
          calc_mode: c.calc_mode,
          rate_value: c.rate_value === "" ? 0 : Number(c.rate_value),
          notes: c.notes || null,
          scope: c.scope === "item" ? "item" : "transaction",
          sales_line_id: c.scope === "item" ? c.sales_line_id || null : null,
          sales_line_no: c.scope === "item" ? c.sales_line_no || null : null,
        })),
    };

    setSaving(true);
    const ed = props.editing ?? createdSale();
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
    const autoOk = await tryAutoSaveSalesInvoice(res.data.id);
    if (autoOk) {
      toast.success(
        ed && props.editing
          ? "Accounting invoice ready — open balance shows in A/R Aging & Customer Book (AR) after Search."
          : "Accounting invoice prepared — receivable is open for Official Receipts / A/R reports.",
      );
    } else {
      toast.warning(
        ed
          ? "Map Sales + Receivable accounts under Chart of Accounts defaults to post the A/R invoice."
          : "Sale saved. Map CoA defaults (Sales + Receivable) to auto-prepare the accounting invoice.",
      );
    }
    setCreatedSale(res.data);
    setSalesNo(res.data.sales_no);
    setDateNoDisplay(res.data.date_no_display);
    setProgressStatus(res.data.progress_status);
    // Keep window open with Invoice tab (Load Slip → Save → Invoice).
    setActiveTab("invoice");
    if (!props.editing) setPostSaveOpen(true);
  };

  const finishPostSave = () => {
    setPostSaveOpen(false);
    props.onClose();
  };

  return (
    <>
      <WideEntityModal
        open={props.open}
        title={effectiveEditing() ? (props.readOnly ? "View sales (deleted)" : "Edit sales") : "New sales"}
        icon={<ModuleIcon id="sales" class="h-5 w-5" />}
        onClose={() => props.onClose()}
        onSave={activeTab() === "details" ? () => void save() : undefined}
        readOnly={props.readOnly}
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
              defaultSubject={buildDocumentEmailSubject(
                firstLineItemName(lines()),
                "Sales",
                auth.me?.tenant.company_name,
              )}
              defaultBody={buildDocumentEmailBody({
                docTypeLabel: "Sales",
                partyLabel: "Customer",
                partyName: customerLabel(),
                referenceNo: salesNo(),
                dateLabel: "Invoice date",
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
            <button
              type="button"
              class="rounded-lg border border-stroke px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-slate-50"
              onClick={() => setHistoryOpen(true)}
            >
              History
            </button>
            <Show when={canReturnLines() && returnableLines().length > 0}>
              <button
                type="button"
                class="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
                onClick={() => setReturnLinesOpen(true)}
              >
                Return lines
              </button>
            </Show>
          </Show>
        }
      >
        <LifecycleReadOnlyShell readOnly={props.readOnly ?? false}>
        <ModalFormGuide guideId="sales" />
        <draft.DraftBanner />
        <Show when={activeTab() === "invoice"}>
          <InvoicePanel
            kind="sales"
            docId={effectiveEditing()?.id}
            formOpen={props.open}
            progressStatus={progressStatus()}
            attachmentsScope="sales"
            onPrint={() => effectiveEditing() && openSalesInvoicePrint(effectiveEditing()!.id)}
            onApprovalChanged={() => {
              void (async () => {
                const res = await apiFetch<SalesDetail>(`/api/v1/sales/${effectiveEditing()!.id}`);
                if (res.success && res.data) setProgressStatus(res.data.progress_status);
              })();
            }}
          />
        </Show>
        <Show when={activeTab() === "details"}>
        <CoaSetupReminder />
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Date-no">
          <input class={inputClass} value={dateNoDisplay()} readOnly />
        </Field>
        <Field label="Sales No.">
          <input class={inputClass} value={salesNo()} readOnly />
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
          fallbackLabel="PIC (document)"
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
        <ModalField settings={byKey} fieldKey="progress_status" fallbackLabel="Progress status">
          {(m) => (
            <ProgressStatusMenu
              value={progressStatus()}
              disabled={m.disabled || progressStatus() === "e_approval"}
              excludeValues={["e_approval"]}
              onChange={setProgressStatus}
            />
          )}
        </ModalField>
        <ModalField settings={byKey} fieldKey="si_dr_no" fallbackLabel="SI/DR No.">
          {(m) => (
            <input
              class={inputClass}
              value={siDrNo()}
              placeholder={m.placeholder}
              disabled={m.disabled}
              onInput={(e) => setSiDrNo(e.currentTarget.value)}
            />
          )}
        </ModalField>
        <Field label="Terms of payment">
          <select class={inputClass} value={termsOfPayment()} onChange={(e) => setTermsOfPayment(e.currentTarget.value)}>
            <option value="">—</option>
            <option value="30_days_terms">30 Days Terms</option>
            <option value="cash">Cash</option>
          </select>
        </Field>
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
          scope="sales"
          formOpen={props.open}
          docId={props.editing?.id ?? createdSale()?.id}
          label={uiLabel("selling.attachments_sales")}
          required={policyRequiresAttachment(processPolicy.data, "sales")}
          onCountChange={setAttachmentCount}
        />
        <Field label="Sales category">
          <select class={inputClass} value={salesCategory()} onChange={(e) => setSalesCategory(e.currentTarget.value)}>
            <option value="">—</option>
            <option value="general">General</option>
            <option value="returns">Returns</option>
          </select>
        </Field>
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
        <Show when={props.editing}>
          <Field label="Created by">
            <input class={inputClass} value={props.editing?.created_by_name ?? ""} readOnly />
          </Field>
        </Show>
        </div>
        <div class="col-span-full mb-2 flex flex-wrap items-center gap-2">
          <LoadSlipMenu
            options={filterLoadSlipOptions(SALES_LOAD_SLIP_OPTIONS, auth.me)}
            onSelect={(id) => {
              if (id === "so") setSoPickerOpen(true);
              if (id === "quotation") setQuotationPickerOpen(true);
              if (id === "shipping") setShippingPickerOpen(true);
              if (id === "pr") setPrPickerOpen(true);
              if (id === "po") setPoPickerOpen(true);
              if (id === "gr") setGrPickerOpen(true);
            }}
          />
          <p class="text-xs text-text-secondary">
            Load Slip fills this form from another document. Click <strong>Save</strong> to create the sales
            invoice — the <strong>Invoice</strong> tab then opens for the accounting voucher. Same-side sources
            apply residual qty; cross-side sources map item/qty only.
          </p>
          <Show when={!props.editing}>
            <button
              type="button"
              class="rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50"
              onClick={() => setHoldOpen(true)}
            >
              Hold list
            </button>
          </Show>
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
          onCreateShippingOrder={(line) => void createShippingFromLine(line)}
        />
        <SalesCommissionPanel
          rows={commissions}
          onChange={setCommissions}
          grandTotal={() => lines().reduce((s, ln) => s + (Number(ln.line_total) || 0), 0)}
          saleLines={() =>
            lines()
              .filter((ln) => ln.item_id || ln.item_code)
              .map((ln) => ({
                line_no: ln.line_no,
                id: detailLines().find((d) => d.line_no === ln.line_no)?.id ?? null,
                label: `${ln.item_code} — ${ln.item_name}`.trim(),
                line_total: Number(ln.line_total) || 0,
              }))
          }
          fetchUsers={fetchUsers}
          disabled={progressStatus() === "e_approval"}
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
        </LifecycleReadOnlyShell>
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
        partnerId={partnerId()}
        partnerLabel={customerLabel()}
      />

      <QuotationLinePickerModal
        open={quotationPickerOpen()}
        onClose={() => setQuotationPickerOpen(false)}
        onConfirm={(picked) => void applyQuotationLines(picked)}
        partnerId={partnerId()}
        partnerLabel={customerLabel()}
      />

      <ShippingOrderLinePickerModal
        open={shippingPickerOpen()}
        partnerId={partnerId()}
        onClose={() => setShippingPickerOpen(false)}
        onConfirm={(picked) => void applyShippingLines(picked)}
      />

      <PurchaseRequestLinePickerModal
        open={prPickerOpen()}
        onClose={() => setPrPickerOpen(false)}
        onConfirm={(picked) => void applyMappedPrLines(picked)}
      />

      <OpenPOLinePickerModal
        open={poPickerOpen()}
        mapOnly
        onClose={() => setPoPickerOpen(false)}
        onConfirm={(picked) => void applyMappedPoLines(picked)}
      />

      <OpenGRLinePickerModal
        open={grPickerOpen()}
        mapOnly
        onClose={() => setGrPickerOpen(false)}
        onConfirm={(picked) => void applyMappedGrLines(picked)}
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
          void recalculateSalesLines(lines(), t.id, t, templateCode()).then(setLines);
        }}
      />

      <SalesHoldListModal
        open={holdOpen()}
        onClose={() => setHoldOpen(false)}
        currentPayload={() => buildHoldPayload()}
        currentAmount={() => holdGrandTotal()}
        onLoad={loadHoldPayload}
      />

      <ReturnSaleLinesModal
        open={returnLinesOpen()}
        salesNo={props.editing?.sales_no ?? ""}
        lines={returnableLines()}
        returning={returningLines()}
        onClose={() => setReturnLinesOpen(false)}
        onConfirm={(lineIds) => void returnSelectedLines(lineIds)}
      />
    </>
  );
}
