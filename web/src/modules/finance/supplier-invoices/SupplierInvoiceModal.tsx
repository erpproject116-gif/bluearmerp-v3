import { createEffect, createSignal, For, Show } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../../shared/api";
import { invalidateRecordHistory } from "../../../shared/invalidateRecordHistory";
import { type LookupOption } from "../../../shared/LookupCombo";
import { DateInput } from "../../../shared/DateInput";
import { ModalField } from "../../../shared/ModalField";
import { ModalLookupField } from "../../../shared/ModalLookupField";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { handleSaveResult, requireFields } from "../../../shared/handleSaveResult";
import { buildRequiredChecks, useFormFieldSettings } from "../../../shared/useFormFieldSettings";
import { PURCHASES_ENTITY } from "../../../shared/entityTypes";
import { useDocumentDraft } from "../../../shared/useDocumentDraft";
import { useToast } from "../../../shared/toast";
import { useAuth, hasPermission } from "../../../shared/auth-context";
import { WideEntityModal } from "../../../shared/WideEntityModal";
import { ModalFormGuide } from "../../../shared/ModalFormGuide";
import { DecimalInput } from "../../../shared/DecimalInput";
import { formatMoney } from "../../../shared/money";
import { LifecycleReadOnlyShell } from "../../../shared/documentLifecycle";
import { ChangeLogPanel } from "../../../shared/ChangeLogPanel";
import { AttachmentsField } from "../../../shared/AttachmentsField";
import {
  downloadAttachment,
  formatFileSize,
  listAttachments,
  type Attachment,
  type AttachmentScope,
} from "../../../shared/attachments";
import { mapCustomValuesToEntity, mergeCustomValues } from "../../../shared/mapCustomValues";
import { uiLabel } from "../../../shared/branding/uiLabel";
import { useProcessPolicy, policyRequiresAttachment, validateAttachmentBeforeConfirm, toastAttachmentRequired, isConfirmingProgress } from "../../../shared/useProcessPolicy";
import { InvoicePanel } from "../../../shared/InvoicePanel";
import { openPurchaseInvoicePrint } from "../../../shared/invoiceDocumentPrint";
import { HistoryLogModal } from "../../../shared/HistoryLogModal";
import { LoadSlipMenu, PURCHASE_LOAD_SLIP_OPTIONS, filterLoadSlipOptions } from "../../../shared/LoadSlipMenu";
import { postInventoryItemSearch } from "../../../shared/inventoryItemSearch";
import { itemSpecAsLineDescription, coalesceSpecDescription } from "../../../shared/itemLineSpecDescription";
import { defaultInputBasis, formatRateSummary, formatTaxTypeLabel } from "../../../shared/taxcalc";
import { fetchLocationOptions, fetchPartnerOptions, useActiveCurrencies, useActiveTaxTypes } from "../../../shared/useDocumentLookups";
import { CoaSetupReminder } from "../../../shared/CoaSetupReminder";
import { getActiveBranchCurrent } from "../../../shared/activeContext";
import type { OpenGRLine, OpenPOLine, OpenSupplierQuotationInvoiceLine, SupplierInvoiceDetail } from "../../../shared/useSupplierInvoiceList";
import { OpenGRLinePickerModal } from "./OpenGRLinePickerModal";
import { OpenPOLinePickerModal } from "./OpenPOLinePickerModal";
import { OpenSupplierQuotationLinePickerModal } from "./OpenSupplierQuotationLinePickerModal";
import {
  SalesOrderLinePickerModal as SalesSideOrderLinePickerModal,
  type PickedSalesOrderLine,
} from "../../sales/sales/SalesOrderLinePickerModal";
import {
  QuotationLinePickerModal,
  type PickedQuotationLine,
} from "../../sales-order/sales-order/QuotationLinePickerModal";
import { DocumentEmailToolbar } from "../../comms/DocumentEmailToolbar";
import { buildDocumentEmailSubject, buildDocumentEmailBody, firstLineItemName } from "../../comms/documentEmailSubject";
import { EmailHistoryPanel } from "../../comms/EmailHistoryPanel";
import { QuickCustomerModal } from "../../../shared/QuickCustomerModal";
import { QuickLocationModal } from "../../../shared/QuickLocationModal";
import { QuickTaxTypeModal } from "../../../shared/QuickTaxTypeModal";
import {
  PurchaseRequestLineGrid,
  emptyPurchaseRequestLine,
  recalculatePurchaseRequestLines,
  type PurchaseRequestLineRow,
} from "../../purchase-request/purchase-request/PurchaseRequestLineGrid";
import { docSeedLinePatch, takeDocSeed } from "../../../shared/docSeed";
import { SupplierInvoiceApprovalPanel } from "./SupplierInvoiceApprovalPanel";
import { tryAutoSavePurchaseInvoice, type InvoiceAutoSaveResult } from "../../../shared/invoiceApi";
import { TermHint } from "../../../shared/TermHint";
import { A } from "@solidjs/router";
import { CustomFieldsSection, validateCustomFields } from "../../../shared/CustomFieldsSection";
import { useCustomValues } from "../../../shared/useCustomValues";
import { SupplierInvoicePostSaveDialog } from "./SupplierInvoicePostSaveDialog";
import { CashPaymentToVendorModal } from "./CashPaymentToVendorModal";

export type { SupplierInvoiceDetail as PurchaseDetail };

type Props = {
  open: boolean;
  editing: SupplierInvoiceDetail | null;
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

function linesFromDetail(lines?: SupplierInvoiceDetail["lines"]): PurchaseRequestLineRow[] {
  if (!lines?.length) return [emptyPurchaseRequestLine(1)];
  return lines.map((ln) => ({
    line_no: ln.line_no,
    partner_id: null,
    partner_code: "",
    partner_name: "",
    item_id: ln.item_id,
    item_code: ln.item_code ?? "",
    item_name: ln.item_name ?? "",
    spec_name: coalesceSpecDescription(null, ln.description),
    description: coalesceSpecDescription(ln.description, null),
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
    goods_receipt_line_id: ln.goods_receipt_line_id ?? null,
    purchase_order_line_id: ln.purchase_order_line_id ?? null,
    track_serial: Boolean(ln.track_serial),
    planned_serial_nos: ln.serial_nos ?? [],
    warranty_duration_months: ln.warranty_duration_months ?? 0,
  }));
}

export function SupplierInvoiceModal(props: Props) {
  const queryClient = useQueryClient();
  const auth = useAuth();
  const toast = useToast();
  const processPolicy = useProcessPolicy(() => props.open);
  const { fields, byKey, activeCustomFields } = useFormFieldSettings(PURCHASES_ENTITY.purchases);
  const { customValues, setCustom, loadCustom } = useCustomValues();
  const [attachmentCount, setAttachmentCount] = createSignal(0);
  type SourceAttachPreview = {
    scope: AttachmentScope;
    docId: number;
    label: string;
    files: Attachment[];
  };
  const [sourceAttachPreview, setSourceAttachPreview] = createSignal<SourceAttachPreview | null>(null);
  const effectiveAttachmentCount = () =>
    attachmentCount() + (sourceAttachPreview()?.files.length ?? 0);
  const taxTypesQuery = useActiveTaxTypes(() => props.open);
  const currenciesQuery = useActiveCurrencies(() => props.open);
  const taxTypes = () => taxTypesQuery.data ?? [];
  const currencies = () => currenciesQuery.data ?? [];
  const [saving, setSaving] = createSignal(false);
  const [createdInvoice, setCreatedInvoice] = createSignal<SupplierInvoiceDetail | null>(null);
  const effectiveEditing = () => props.editing ?? createdInvoice();
  const [postSaveOpen, setPostSaveOpen] = createSignal(false);
  const [postSaveAccounting, setPostSaveAccounting] = createSignal<InvoiceAutoSaveResult | null>(null);
  const [cashPaymentOpen, setCashPaymentOpen] = createSignal(false);
  const [grPickerOpen, setGrPickerOpen] = createSignal(false);
  const [poPickerOpen, setPoPickerOpen] = createSignal(false);
  const [rfqPickerOpen, setRfqPickerOpen] = createSignal(false);
  const [soPickerOpen, setSoPickerOpen] = createSignal(false);
  const [quotationPickerOpen, setQuotationPickerOpen] = createSignal(false);
  const [slipBarcode, setSlipBarcode] = createSignal("");
  const [slipBarcodeBusy, setSlipBarcodeBusy] = createSignal(false);
  const [historyOpen, setHistoryOpen] = createSignal(false);
  const [showNewVendor, setShowNewVendor] = createSignal(false);
  const [newVendorName, setNewVendorName] = createSignal("");
  const [showNewLocation, setShowNewLocation] = createSignal(false);
  const [newLocationName, setNewLocationName] = createSignal("");
  const [showNewTaxType, setShowNewTaxType] = createSignal(false);
  const [newTaxTypeName, setNewTaxTypeName] = createSignal("");
  const [activeTab, setActiveTab] = createSignal<"details" | "invoice">("details");
  const [invoiceDate, setInvoiceDate] = createSignal(todayISO());
  const [dateNoDisplay, setDateNoDisplay] = createSignal("");
  const [invoiceNo, setInvoiceNo] = createSignal("");
  const [taxTypeId, setTaxTypeId] = createSignal<number | null>(null);
  const [taxTypeLabel, setTaxTypeLabel] = createSignal("");
  const [currencyId, setCurrencyId] = createSignal<number | null>(null);
  const [partnerId, setPartnerId] = createSignal<number | null>(null);
  const [vendorLabel, setVendorLabel] = createSignal("");
  const [picUserId, setPicUserId] = createSignal<number | null>(null);
  const [picName, setPicName] = createSignal("");
  const [locationId, setLocationId] = createSignal<number | null>(null);
  const [locationLabel, setLocationLabel] = createSignal("");
  const [projectId, setProjectId] = createSignal<number | null>(null);
  const [projectLabel, setProjectLabel] = createSignal("");
  const [projectName, setProjectName] = createSignal("");
  const [dueDate, setDueDate] = createSignal("");
  const [paymentTerms, setPaymentTerms] = createSignal("");
  const [vendorInvoiceNo, setVendorInvoiceNo] = createSignal("");
  const [reference, setReference] = createSignal("");
  const [notes, setNotes] = createSignal("");
  const [progressStatus, setProgressStatus] = createSignal("unconfirmed");
  const [lines, setLines] = createSignal<PurchaseRequestLineRow[]>([emptyPurchaseRequestLine(1)]);

  type WhtRow = { tax_code_id: number | null; code: string; rate_pct: number; base_amount: string };
  const [withholdingLines, setWithholdingLines] = createSignal<WhtRow[]>([]);

  const whtCodes = createQuery(() => ({
    queryKey: ["withholding-codes-si"],
    queryFn: async () => {
      const res = await apiFetch<{ id: number; code: string; description: string; rate_pct: number; atc_code?: string | null }[]>(
        "/api/v1/finance/withholding-codes",
      );
      if (!res.success) throw new Error(res.message ?? "Failed to load withholding codes");
      return res.data ?? [];
    },
    enabled: () => props.open,
  }));

  const totalWithheld = () =>
    withholdingLines().reduce((sum, row) => {
      const base = Number(row.base_amount) || 0;
      return sum + base * (row.rate_pct / 100);
    }, 0);

  const addWhtLine = () => {
    const codes = whtCodes.data ?? [];
    const first = codes[0];
    setWithholdingLines((rows) => [
      ...rows,
      { tax_code_id: first?.id ?? null, code: first?.code ?? "", rate_pct: first?.rate_pct ?? 0, base_amount: "" },
    ]);
  };

  const selectedTaxType = () => taxTypes().find((t) => t.id === taxTypeId()) ?? null;

  createEffect(() => {
    const id = taxTypeId();
    if (id == null || taxTypeLabel()) return;
    const meta = taxTypes().find((t) => t.id === id);
    if (meta) setTaxTypeLabel(formatTaxTypeLabel(meta.name, meta.tax_mode, meta.rate_percent));
  });

  const buildDraftPayload = () => ({
    invoice_date: invoiceDate(),
    tax_type_id: taxTypeId(),
    currency_id: currencyId(),
    partner_id: partnerId(),
    vendor_label: vendorLabel(),
    pic_user_id: picUserId(),
    pic_name: picName(),
    location_id: locationId(),
    location_label: locationLabel(),
    project_id: projectId(),
    project_label: projectLabel(),
    project_name: projectName(),
    due_date: dueDate(),
    payment_terms: paymentTerms(),
    vendor_invoice_no: vendorInvoiceNo(),
    reference: reference(),
    notes: notes(),
    progress_status: progressStatus(),
    lines: lines(),
    custom_values: customValues(),
  });

  const applyDraftPayload = (payload: ReturnType<typeof buildDraftPayload>) => {
    setInvoiceDate(payload.invoice_date);
    setTaxTypeId(payload.tax_type_id);
    setTaxTypeLabel("");
    setCurrencyId(payload.currency_id);
    setPartnerId(payload.partner_id);
    setVendorLabel(payload.vendor_label);
    setPicUserId(payload.pic_user_id);
    setPicName(payload.pic_name);
    setLocationId(payload.location_id);
    setLocationLabel(payload.location_label);
    setProjectId(payload.project_id);
    setProjectLabel(payload.project_label);
    setProjectName(payload.project_name);
    setDueDate(payload.due_date);
    setPaymentTerms(payload.payment_terms);
    setVendorInvoiceNo(payload.vendor_invoice_no);
    setReference(payload.reference);
    setNotes(payload.notes);
    setProgressStatus(payload.progress_status || "unconfirmed");
    setLines(payload.lines?.length ? payload.lines : [emptyPurchaseRequestLine(1)]);
    loadCustom(payload.custom_values ?? {});
  };

  const draft = useDocumentDraft({
    entityType: PURCHASES_ENTITY.purchases,
    draftKey: () => (props.editing ? `edit-${props.editing.id}` : "new"),
    getPayload: buildDraftPayload,
    onApply: applyDraftPayload,
    enabled: () => props.open,
    // Banner-only: show Restore/Discard so the user chooses (ECOUNT-style recovery).
  });

  const loadPreview = async (date: string) => {
    const res = await apiFetch<{ date_no_display: string; invoice_no: string }>(
      `/api/v1/finance/supplier-invoices/preview-sequences?invoice_date=${encodeURIComponent(date)}`,
    );
    if (res.success && res.data) {
      setDateNoDisplay(res.data.date_no_display);
      setInvoiceNo(res.data.invoice_no);
    }
  };

  let seededNewLines = false;

  createEffect(() => {
    if (!props.open) {
      setCreatedInvoice(null);
      setSourceAttachPreview(null);
      return;
    }
    const ed = props.editing;
    if (ed) {
      setSourceAttachPreview(null);
      setInvoiceDate(ed.invoice_date);
      setDateNoDisplay(ed.date_no_display);
      setInvoiceNo(ed.invoice_no);
      setTaxTypeId(ed.tax_type_id ?? null);
      setTaxTypeLabel(ed.tax_type_name ?? "");
      setCurrencyId(ed.currency_id);
      setPartnerId(ed.partner_id);
      setVendorLabel(ed.vendor_name);
      setPicUserId(ed.pic_user_id ?? null);
      setPicName(ed.pic_name ?? "");
      setLocationId(ed.location_id ?? null);
      setLocationLabel(ed.location_name ?? "");
      setProjectId(ed.project_id ?? null);
      setProjectLabel(ed.project_name ?? "");
      setProjectName(ed.project_name ?? "");
      setDueDate(ed.due_date ?? "");
      setPaymentTerms(ed.payment_terms ?? "");
      setVendorInvoiceNo(ed.vendor_invoice_no ?? "");
      setReference(ed.reference ?? "");
      setNotes(ed.notes ?? "");
      setProgressStatus(ed.progress_status || "unconfirmed");
      setLines(linesFromDetail(ed.lines));
      loadCustom(ed.custom_values ?? {});
      setWithholdingLines(
        (ed.withholding_lines ?? []).map((ln) => ({
          tax_code_id: ln.tax_code_id,
          code: ln.code,
          rate_pct: ln.rate_pct,
          base_amount: String(ln.base_amount ?? ""),
        })),
      );
      setActiveTab("details");
    } else {
      const seed = takeDocSeed("purchases");
      const seedLines = (seed?.lines ?? []).slice(0, 200).map((line, index) => ({
        ...emptyPurchaseRequestLine(index + 1),
        ...docSeedLinePatch(line),
      }));
      setInvoiceDate(todayISO());
      setPartnerId(seed?.partner_id ?? null);
      setVendorLabel(seed?.partner_name ?? "");
      setPicUserId(null);
      setPicName("");
      const branch = getActiveBranchCurrent();
      setLocationId(branch?.id ?? null);
      setLocationLabel(branch?.name ?? "");
      setProjectId(null);
      setProjectLabel("");
      setProjectName("");
      setDueDate("");
      setPaymentTerms("");
      setVendorInvoiceNo("");
      setReference("");
      setNotes("");
      setProgressStatus("unconfirmed");
      loadCustom({});
      setWithholdingLines([]);
      seededNewLines = seedLines.length > 0;
      if (seededNewLines) {
        setLines(seedLines);
        if (seed?.needs_qty_review) {
          toast.warning("Baiko prefilled item lines with qty 1 — review quantities before saving.");
        }
      } else {
        setLines([emptyPurchaseRequestLine(1)]);
      }
      setActiveTab("details");
      void loadPreview(todayISO());
    }
  });

  let appliedNewDefaults = false;
  createEffect(() => {
    if (!props.open) {
      appliedNewDefaults = false;
      return;
    }
    if (effectiveEditing()) return;
    const tt = taxTypes();
    const cc = currencies();
    if (!tt.length || !cc.length) return;
    // Apply defaults once per open — do not re-fill after the user Clears a combo.
    if (appliedNewDefaults) return;
    appliedNewDefaults = true;
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
    if (!props.open || effectiveEditing()) return;
    void loadPreview(invoiceDate());
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

  const applyGRLines = async (picked: OpenGRLine[]) => {
    if (picked.length === 0) return;
    const meta = taxTypes().find((t) => t.id === taxTypeId());
    const basis = meta ? defaultInputBasis(meta.tax_mode) : "vat_inc_unit";
    const start = lines().length;
    const newLines: PurchaseRequestLineRow[] = picked.map((row, i) => ({
      ...emptyPurchaseRequestLine(start + i + 1, String(row.unit_vat_inc), basis),
      item_id: row.item_id ?? null,
      item_code: row.item_code,
      item_name: row.item_name,
      qty: String(row.balance_qty),
      unit_price: String(row.unit_vat_inc),
      unit_id: row.unit_id ?? row.base_unit_id ?? null,
      unit_code: row.unit_code || row.base_unit_code || "",
      goods_receipt_line_id: row.goods_receipt_line_id,
    }));
    const merged = [...lines().filter((ln) => ln.item_id || ln.item_code), ...newLines].map((ln, i) => ({ ...ln, line_no: i + 1 }));
    if (meta && taxTypeId()) {
      setLines(await recalculatePurchaseRequestLines(merged.length ? merged : newLines, taxTypeId()!, meta));
    } else {
      setLines(merged.length ? merged : newLines);
    }
  };

  /** Ecount Slip Barcode: scan/type item code → add purchase line (Bluearm barcodes map to item_code). */
  const applySlipBarcode = async () => {
    const code = slipBarcode().trim();
    if (!code) {
      toast.warning("Enter a slip / item barcode.");
      return;
    }
    setSlipBarcodeBusy(true);
    const res = await postInventoryItemSearch({
      item_code: code,
      keyword: code,
      usage_status: "active",
      page: 1,
      pageSize: 5,
    });
    setSlipBarcodeBusy(false);
    if (!res.success || !(res.data?.length)) {
      toast.warning(res.message ?? `No item found for barcode “${code}”.`);
      return;
    }
    const row = res.data.find((r) => r.item_code.toLowerCase() === code.toLowerCase()) ?? res.data[0];
    const meta = taxTypes().find((t) => t.id === taxTypeId());
    const basis = meta ? defaultInputBasis(meta.tax_mode) : "vat_inc_unit";
    const price = row.sales_price != null ? String(row.sales_price) : "";
    const filled = lines().filter((ln) => ln.item_id || ln.item_code);
    const patch: PurchaseRequestLineRow = {
      ...emptyPurchaseRequestLine(filled.length + 1, price, basis),
      item_id: row.id,
      item_code: row.item_code,
      item_name: row.item_name,
      spec_name: itemSpecAsLineDescription(row),
      description: itemSpecAsLineDescription(row),
      unit_id: row.base_unit_id ?? null,
      unit_code: row.base_unit_code ?? "",
      qty: "1",
      unit_price: price,
    };
    const merged = [...filled, patch].map((ln, i) => ({ ...ln, line_no: i + 1 }));
    if (meta && taxTypeId()) {
      setLines(await recalculatePurchaseRequestLines(merged, taxTypeId()!, meta));
    } else {
      setLines(merged);
    }
    setSlipBarcode("");
    toast.success(`Added ${row.item_code}.`);
  };

  createEffect(() => {
    const purchaseId = createdInvoice()?.id ?? props.editing?.id;
    if (purchaseId && sourceAttachPreview()) {
      setSourceAttachPreview(null);
    }
  });

  const loadSourceAttachPreview = async (
    scope: AttachmentScope,
    docId: number,
    label: string,
  ) => {
    if (!docId || docId <= 0) {
      setSourceAttachPreview(null);
      return;
    }
    const res = await listAttachments(scope, docId);
    if (res.success && (res.data?.length ?? 0) > 0) {
      setSourceAttachPreview({ scope, docId, label, files: res.data! });
    } else {
      setSourceAttachPreview(null);
    }
  };

  const loadSourceCustomValues = async (path: string, docId: number) => {
    if (!docId || docId <= 0) return;
    const res = await apiFetch<{ custom_values?: Record<string, unknown> }>(path);
    if (!res.success || !res.data?.custom_values) return;
    const mapped = mapCustomValuesToEntity(res.data.custom_values, fields());
    if (Object.keys(mapped).length === 0) return;
    loadCustom(mergeCustomValues(customValues(), mapped));
  };

  const applyPOLines = async (picked: OpenPOLine[]) => {
    if (picked.length === 0) return;
    const first = picked[0];
    if (first.order_date) {
      setInvoiceDate(first.order_date);
      void loadPreview(first.order_date);
    }
    if (first.partner_id) {
      setPartnerId(first.partner_id);
      setVendorLabel(first.partner_name ?? "");
    }
    if (first.tax_type_id) {
      setTaxTypeId(first.tax_type_id);
      const meta = taxTypes().find((t) => t.id === first.tax_type_id);
      setTaxTypeLabel(meta ? formatTaxTypeLabel(meta.name, meta.tax_mode, meta.rate_percent) : "");
    }
    if (first.currency_id) {
      setCurrencyId(first.currency_id);
    }
    if (first.location_id) {
      setLocationId(first.location_id);
      setLocationLabel(first.location_name ?? "");
    }
    if (first.pic_user_id != null) {
      setPicUserId(first.pic_user_id);
    }
    if (first.pic_name) {
      setPicName(first.pic_name);
    }
    if (first.project_id) {
      setProjectId(first.project_id);
      setProjectLabel(first.project_name ?? "");
      setProjectName(first.project_name ?? "");
    } else if (first.project_name) {
      setProjectId(null);
      setProjectLabel(first.project_name);
      setProjectName(first.project_name);
    }
    // Purchases "PO Number" field — stamp the originating PO doc no.
    setReference(first.purchase_order_no || first.reference || "");
    if (first.notes) {
      setNotes(first.notes);
    }

    const taxId = first.tax_type_id ?? taxTypeId();
    const meta = taxTypes().find((t) => t.id === taxId);
    const basis = meta ? defaultInputBasis(meta.tax_mode) : "vat_inc_unit";
    const newLines: PurchaseRequestLineRow[] = picked.map((row, i) => ({
      ...emptyPurchaseRequestLine(i + 1, String(row.unit_vat_inc), basis),
      item_id: row.item_id,
      item_code: row.item_code,
      item_name: row.item_name,
      qty: String(row.balance_qty),
      unit_price: String(row.unit_vat_inc),
      unit_id: row.unit_id ?? row.base_unit_id ?? null,
      unit_code: row.unit_code || row.base_unit_code || "",
      purchase_order_line_id: row.purchase_order_line_id,
      track_serial: row.track_serial,
      warranty_duration_months: row.warranty_duration_months ?? 0,
    }));
    if (meta && taxId) {
      setLines(await recalculatePurchaseRequestLines(newLines, taxId, meta));
    } else {
      setLines(newLines);
    }
    await Promise.all([
      loadSourceAttachPreview(
        "purchase-order/purchase-orders",
        first.purchase_order_id,
        "From Purchase Order (copies when you Save)",
      ),
      loadSourceCustomValues(
        `/api/v1/purchase-order/purchase-orders/${first.purchase_order_id}`,
        first.purchase_order_id,
      ),
    ]);
    toast.success(
      "Purchase Order lines loaded. Header fields, attachments, and matching custom fields copy when you Save.",
    );
  };

  const applySupplierQuotationLines = async (picked: OpenSupplierQuotationInvoiceLine[]) => {
    await applyPOLines(picked);
  };

  const mapSellingOntoPurchase = async (
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
    const mapped = rows.map((row, i) => ({
      ...emptyPurchaseRequestLine(start + i + 1, String(row.unit_vat_inc), basis),
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
      toast.warning("Please select a vendor.");
      return;
    }
    if (!locationId()) {
      toast.warning("Please select a location.");
      return;
    }
    const formValues = {
      invoice_date: invoiceDate(),
      partner_id: partnerId(),
      tax_type_id: taxTypeId(),
      currency_id: currencyId(),
      location_id: locationId(),
      vendor_invoice_no: vendorInvoiceNo(),
      notes: notes(),
    };
    const clientError =
      requireFields(formValues as Record<string, unknown>, buildRequiredChecks(fields())) ??
      validateCustomFields(customValues(), activeCustomFields());
    if (clientError) {
      toast.warning(clientError);
      return;
    }
    const attachmentErr = validateAttachmentBeforeConfirm(
      processPolicy.data,
      "supplier_invoice",
      progressStatus(),
      effectiveAttachmentCount(),
      effectiveEditing()?.id,
    );
    if (attachmentErr) {
      toastAttachmentRequired(toast, "supplier_invoice", attachmentErr);
      return;
    }

    const body = {
      invoice_date: invoiceDate(),
      tax_type_id: taxTypeId(),
      partner_id: partnerId(),
      currency_id: currencyId(),
      pic_user_id: picUserId(),
      pic_name: picName(),
      location_id: locationId(),
      project_id: projectId(),
      project_name: projectName() || null,
      due_date: dueDate() || null,
      terms_of_payment: null,
      payment_terms: paymentTerms() || null,
      vendor_invoice_no: vendorInvoiceNo() || null,
      reference: reference() || null,
      notes: notes() || null,
      // New docs always start unconfirmed; progress is changed on the list.
      progress_status: effectiveEditing() ? progressStatus() : "unconfirmed",
      lines: lines()
        .filter((ln) => ln.item_id || ln.item_code || ln.goods_receipt_line_id || ln.purchase_order_line_id)
        .map((ln, i) => ({
          line_no: i + 1,
          goods_receipt_line_id: ln.goods_receipt_line_id ?? null,
          purchase_order_line_id: ln.purchase_order_line_id ?? null,
          item_id: ln.item_id || null,
          item_code: ln.item_code,
          item_name: ln.item_name,
          description: ln.description || null,
          qty: ln.qty === "" ? 0 : Number(ln.qty),
          unit_id: ln.unit_id || null,
          unit_code: ln.unit_code || null,
          unit_price: ln.unit_price === "" ? 0 : Number(ln.unit_price),
          input_basis: ln.input_basis,
          unit_non_vat: ln.unit_non_vat === "" ? 0 : Number(ln.unit_non_vat),
          non_vat_total: ln.non_vat_total === "" ? 0 : Number(ln.non_vat_total),
          tax_amount: ln.tax_amount === "" ? 0 : Number(ln.tax_amount),
          unit_vat_inc: ln.unit_vat_inc === "" ? 0 : Number(ln.unit_vat_inc),
          line_total: ln.line_total === "" ? 0 : Number(ln.line_total),
          remark: ln.remark || null,
          serial_nos: ln.planned_serial_nos ?? [],
          warranty_duration_months: ln.warranty_duration_months ?? 0,
        })),
      withholding_lines: withholdingLines()
        .filter((ln) => ln.tax_code_id && Number(ln.base_amount) > 0)
        .map((ln) => ({ tax_code_id: ln.tax_code_id!, base_amount: Number(ln.base_amount) })),
      custom_values: customValues(),
    };

    if (body.lines.length === 0) {
      toast.warning("Add at least one line item.");
      return;
    }

    const confirming =
      progressStatus() === "completed" ||
      progressStatus() === "confirm" ||
      progressStatus() === "e_approval";
    if (confirming) {
      for (const ln of lines().filter((l) => l.item_id || l.item_code || l.goods_receipt_line_id || l.purchase_order_line_id)) {
        if (!ln.track_serial) continue;
        const need = Math.floor(Number(ln.qty) || 0);
        const got = (ln.planned_serial_nos ?? []).length;
        if (need > 0 && got !== need) {
          toast.warning(
            `Line ${ln.line_no}: serial count (${got}) must equal qty (${need}). Set qty first, then scan serials.`,
          );
          return;
        }
      }
    }

    setSaving(true);
    const ed = effectiveEditing();
    const res = await (ed
      ? apiFetch<SupplierInvoiceDetail>(`/api/v1/finance/supplier-invoices/${ed.id}`, { method: "PATCH", body: JSON.stringify(body) }, { silent: true })
      : apiFetch<SupplierInvoiceDetail>("/api/v1/finance/supplier-invoices", { method: "POST", body: JSON.stringify(body) }, { silent: true }));
    setSaving(false);
    if (!res.success || !res.data) {
      handleSaveResult(
        res,
        toast,
        props.editing
          ? "Bill saved. Approve when ready, then record payment."
          : "Bill created. Check lines, then submit for approval.",
      );
      return;
    }
    toast.success(props.editing ? "Purchase updated." : "Purchase created.");
    if (props.editing) invalidateRecordHistory(queryClient, "fin_supplier_invoice", props.editing.id);
    await draft.clearOnSave();
    props.onSaved();
    if (props.editing) {
      void tryAutoSavePurchaseInvoice(props.editing.id);
      props.onClose();
      return;
    }
    setCreatedInvoice(res.data);
    const autoSave = await tryAutoSavePurchaseInvoice(res.data.id);
    setPostSaveAccounting(autoSave);
    const hasPOLines = body.lines.some(
      (ln: { purchase_order_line_id?: number | null }) =>
        ln.purchase_order_line_id != null && Number(ln.purchase_order_line_id) > 0,
    );
    const hasGRLines = body.lines.some(
      (ln: { goods_receipt_line_id?: number | null }) =>
        ln.goods_receipt_line_id != null && Number(ln.goods_receipt_line_id) > 0,
    );
    let stockMsg =
      "Purchases do not change BOM recipes — only on-hand qty for qty-tracked items.";
    if (hasPOLines && !hasGRLines) {
      stockMsg =
        "Stock updated at the purchase location when items track inventory (auto-receive). BOM recipes are unchanged.";
    } else if (hasGRLines) {
      stockMsg = "Already received earlier — this save is billing only. Check Inv Per Branch / Stock Movements for qty.";
    }
    stockMsg = `${stockMsg} ${autoSave.message}`;
    if (toast.action) {
      toast.action({
        type: autoSave.ok ? "success" : "warning",
        title: autoSave.ok ? "Purchase created — accounting ready." : "Purchase created.",
        message: stockMsg,
        actionLabel: "Inv Per Branch",
        href: "/app/inventory/find-stock",
      });
    } else if (autoSave.ok) {
      toast.success(stockMsg);
    } else {
      toast.warning(stockMsg);
    }
    setPostSaveOpen(true);
  };

  return (
    <>
      <WideEntityModal
        open={props.open}
        title={effectiveEditing() ? (props.readOnly ? "View Purchases (deleted)" : "Edit Purchases") : "Purchase Receive"}
        onClose={props.onClose}
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
              sendUrl="/api/v1/finance/supplier-invoices/{id}/send-email"
              title="Email purchase"
              defaultSubject={buildDocumentEmailSubject(
                firstLineItemName(lines()),
                "Purchase",
                auth.me?.tenant.company_name,
              )}
              defaultBody={buildDocumentEmailBody({
                docTypeLabel: "Purchase",
                partyLabel: "Vendor",
                partyName: vendorLabel(),
                referenceNo: invoiceNo(),
                dateLabel: "Invoice date",
                date: invoiceDate(),
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
          </Show>
        }
      >
        <LifecycleReadOnlyShell readOnly={props.readOnly ?? false}>
        <ModalFormGuide guideId="supplier_invoice" />
        <div class="mb-3 rounded-lg border border-brand-100 bg-brand-50/50 px-3 py-2 text-xs text-slate-700">
          <p class="font-medium text-text-primary">
            <TermHint term="supplier_invoice" asHeading />
          </p>
          <Show
            when={
              progressStatus() === "completed" ||
              progressStatus() === "confirm" ||
              progressStatus() === "e_approval"
            }
            fallback={
              <p class="mt-1">
                Save the document, then set Progress to <span class="font-medium">Completed</span> to post stock
                and AP. Next after that:{" "}
                <A href="/app/finance/payment-vouchers" class="font-medium text-brand-700 hover:underline">
                  Payment Made
                </A>
                .
              </p>
            }
          >
            <p class="mt-1">
              Posted or confirming — next:{" "}
              <A href="/app/finance/payment-vouchers" class="font-medium text-brand-700 hover:underline">
                Payment Made
              </A>{" "}
              (pay the vendor). Serial units:{" "}
              <A href="/app/inventory/serial-lot/registry" class="font-medium text-brand-700 hover:underline">
                Serials
              </A>
              .
            </p>
          </Show>
        </div>
        <draft.DraftBanner />
        <Show when={activeTab() === "invoice"}>
          <InvoicePanel
            kind="purchase"
            docId={effectiveEditing()?.id}
            formOpen={props.open}
            progressStatus={progressStatus()}
            attachmentsScope="finance/supplier-invoices"
            onPrint={() => {
              const id = effectiveEditing()?.id;
              if (id) openPurchaseInvoicePrint(id);
            }}
            onApprovalChanged={() => {
              void apiFetch<SupplierInvoiceDetail>(`/api/v1/finance/supplier-invoices/${effectiveEditing()!.id}`).then((res) => {
                if (res.success && res.data) setProgressStatus(res.data.progress_status);
              });
            }}
          />
        </Show>
        <Show when={activeTab() === "details"}>
          <CoaSetupReminder />
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Date-no">
              <input class={inputClass} value={dateNoDisplay()} readOnly />
            </Field>
            <Field label="Purchase No.">
              <input class={inputClass} value={invoiceNo()} readOnly />
            </Field>
            <ModalField settings={byKey} fieldKey="invoice_date" fallbackLabel="Date" fallbackRequired>
              {(m) => (
                <DateInput value={invoiceDate()} disabled={m.disabled} onInput={(e) => setInvoiceDate(e.currentTarget.value)} />
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
              {(t) => <p class="mt-1 text-xs text-text-secondary md:col-span-2">{formatRateSummary(t().tax_mode, t().rate_percent)}</p>}
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
              fallbackLabel="Vendor"
              fallbackRequired
              value={vendorLabel}
              selectedId={partnerId}
              onInput={setVendorLabel}
              onSelect={(o) => {
                setPartnerId(o.id);
                setVendorLabel(o.label);
              }}
              onClear={() => {
                setPartnerId(null);
                setVendorLabel("");
              }}
              fetchOptions={(q) => fetchPartnerOptions(q, "vendor")}
              createLabel="Add vendor"
              onCreate={(q) => {
                setNewVendorName(q);
                setShowNewVendor(true);
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
                <Show
                  when={Boolean(effectiveEditing())}
                  fallback={
                    <p class="rounded-lg border border-dashed border-stroke bg-slate-50 px-3 py-2 text-xs text-text-secondary">
                      Starts as Unconfirmed. Set Progress Status on the list after save to Complete and post stock.
                    </p>
                  }
                >
                  <p class="rounded-lg border border-stroke bg-slate-50 px-3 py-2 text-sm text-text-secondary">
                    {progressStatus() === "completed"
                      ? "Completed"
                      : progressStatus() === "e_approval"
                        ? "E-Approval"
                        : progressStatus() === "in_progress"
                          ? "In progress"
                          : "Unconfirmed"}{" "}
                    — change on the list (Progress Status column).
                  </p>
                  {/* Keep field settings wiring; control is list-only. */}
                  <span class="sr-only">{m.label}</span>
                </Show>
              )}
            </ModalField>
            <ModalField settings={byKey} fieldKey="vendor_invoice_no" fallbackLabel="Vendor invoice no.">
              {(m) => (
                <input
                  class={inputClass}
                  value={vendorInvoiceNo()}
                  placeholder={m.placeholder}
                  disabled={m.disabled}
                  onInput={(e) => setVendorInvoiceNo(e.currentTarget.value)}
                />
              )}
            </ModalField>
            <ModalField settings={byKey} fieldKey="payment_terms" fallbackLabel="Payment terms">
              {(m) => (
                <input
                  class={inputClass}
                  value={paymentTerms()}
                  placeholder={m.placeholder || "e.g. Net 30, COD, 50% deposit"}
                  disabled={m.disabled}
                  onInput={(e) => setPaymentTerms(e.currentTarget.value)}
                />
              )}
            </ModalField>
            <ModalField settings={byKey} fieldKey="reference" fallbackLabel="PO Number">
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
            <div class="col-span-full grid grid-cols-1 gap-3 md:grid-cols-2">
              <Show
                when={sourceAttachPreview()}
                fallback={
                  <div class="rounded-lg border border-dashed border-stroke bg-slate-50/80 px-3 py-3">
                    <p class="text-sm font-medium text-text-primary">From source document</p>
                    <p class="mt-0.5 text-xs text-text-secondary">
                      Use Load Slip → Purchase Order to preview PO files here. They copy onto this purchase when you Save.
                    </p>
                  </div>
                }
              >
                {(preview) => (
                  <div class="rounded-lg border border-brand-200 bg-brand-50/40 px-3 py-3">
                    <p class="text-sm font-medium text-text-primary">{preview().label}</p>
                    <p class="mt-0.5 text-xs text-text-secondary">
                      Read-only from the purchase order. Files copy onto this purchase when you Save.
                    </p>
                    <ul class="mt-2 space-y-1">
                      <For each={preview().files}>
                        {(file) => (
                          <li class="flex flex-wrap items-center justify-between gap-2 text-sm">
                            <span class="truncate text-text-primary">
                              {file.file_name}
                              <span class="ml-2 text-xs text-text-secondary">{formatFileSize(file.size_bytes)}</span>
                            </span>
                            <button
                              type="button"
                              class="shrink-0 text-xs font-medium text-brand-700 hover:underline"
                              onClick={() =>
                                void downloadAttachment(preview().scope, preview().docId, file).then((ok) => {
                                  if (!ok) toast.warning("Couldn't download the file. Try again.");
                                })
                              }
                            >
                              Download
                            </button>
                          </li>
                        )}
                      </For>
                    </ul>
                  </div>
                )}
              </Show>
              <AttachmentsField
                scope="finance/supplier-invoices"
                formOpen={props.open}
                docId={effectiveEditing()?.id}
                label={`${uiLabel("purchasing.attachments_invoice")} (DR / vendor SI)`}
                emptyUnsavedHint="Upload extra files for this purchase (max 25 MB each). Uploads when you Save."
                required={
                  policyRequiresAttachment(processPolicy.data, "supplier_invoice") &&
                  isConfirmingProgress("supplier_invoice", progressStatus()) &&
                  !sourceAttachPreview()
                }
                onCountChange={setAttachmentCount}
              />
            </div>
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
              entityType={PURCHASES_ENTITY.purchases}
              values={customValues}
              onChange={setCustom}
            />
          </div>
          <div class="col-span-full mb-2 mt-2 flex flex-wrap items-center gap-2">
            <LoadSlipMenu
              options={filterLoadSlipOptions(PURCHASE_LOAD_SLIP_OPTIONS, auth.me)}
              onSelect={(id) => {
                if (id === "po") setPoPickerOpen(true);
                if (id === "gr") setGrPickerOpen(true);
                if (id === "rfq") setRfqPickerOpen(true);
                if (id === "so") setSoPickerOpen(true);
                if (id === "quotation") setQuotationPickerOpen(true);
              }}
            />
            <label class="flex items-center gap-1.5 text-sm text-text-secondary">
              <span class="whitespace-nowrap">Slip Barcode</span>
              <input
                class={`${inputClass} w-40`}
                value={slipBarcode()}
                placeholder="Item code…"
                disabled={props.readOnly || slipBarcodeBusy()}
                onInput={(e) => setSlipBarcode(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void applySlipBarcode();
                  }
                }}
              />
            </label>
            <button
              type="button"
              class="rounded-lg border border-stroke px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-slate-50 disabled:opacity-50"
              disabled={props.readOnly || slipBarcodeBusy()}
              onClick={() => void applySlipBarcode()}
            >
              {slipBarcodeBusy() ? "…" : "Add"}
            </button>
            <p class="text-xs text-text-secondary">
              <Show
                when={processPolicy.data?.purchase_require_gr_before_supplier_invoice}
                fallback="Load Slip → Purchase Order (or blank Bill) posts stock + serials when you confirm. Attach DR / vendor SI before Completed."
              >
                Process policy requires Purchase Receive before Bill — use Load Slip → Purchase Receive, or turn the gate off under Process policies (Bill-first is the default).
              </Show>
            </p>
            <ol class="mt-2 list-decimal space-y-0.5 pl-4 text-xs text-text-secondary">
              <li>
                Confirm a{" "}
                <A href="/app/purchase-order/purchase-orders" class="font-medium text-brand-700 hover:underline">
                  Purchase Order
                </A>
                .
              </li>
              <li>
                <A href="/app/purchases/purchase-receive" class="font-medium text-brand-700 hover:underline">
                  Purchase Receive
                </A>{" "}
                — receive qty and scan serials/lots if needed.
              </li>
              <li>Return here → <strong>Load Slip → Bill</strong> → Save.</li>
            </ol>
          </div>
          <PurchaseRequestLineGrid
            lines={lines}
            onChange={setLines}
            taxTypeId={() => taxTypeId()}
            taxTypeMeta={selectedTaxType}
            locationId={() => locationId()}
            hidePartnerColumns
            showWarrantyColumns
            serialCaptureMode="bill"
            docKind="purchase_receive"
            lineViewKey={`${PURCHASES_ENTITY.purchases}.lines`}
          />
          <Show when={!props.readOnly}>
            <div class="col-span-full space-y-2 border-t border-stroke pt-4">
              <div class="flex items-center justify-between">
                <p class="text-sm font-medium text-text-primary">
                  <TermHint term="withholding_tax" /> (2307)
                </p>
                <button type="button" class="text-sm text-brand-600" onClick={addWhtLine}>
                  + Add withholding line
                </button>
              </div>
              <For each={withholdingLines()}>
                {(_, index) => (
                  <div class="grid grid-cols-3 gap-2">
                    <Field label="Tax code">
                      <select
                        class={inputClass}
                        value={withholdingLines()[index()]?.tax_code_id ?? ""}
                        onChange={(e) => {
                          const id = Number(e.currentTarget.value);
                          const code = (whtCodes.data ?? []).find((c) => c.id === id);
                          setWithholdingLines((rows) =>
                            rows.map((r, idx) =>
                              idx === index()
                                ? { ...r, tax_code_id: id || null, code: code?.code ?? "", rate_pct: code?.rate_pct ?? 0 }
                                : r,
                            ),
                          );
                        }}
                      >
                        <option value="">Select code…</option>
                        {(whtCodes.data ?? []).map((c) => (
                          <option value={String(c.id)}>
                            {c.atc_code ?? c.code} — {c.description} ({c.rate_pct}%)
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Income base amount">
                      <DecimalInput
                        class={inputClass}
                        value={withholdingLines()[index()]?.base_amount ?? ""}
                        onValue={(v) =>
                          setWithholdingLines((rows) => rows.map((r, idx) => (idx === index() ? { ...r, base_amount: v } : r)))
                        }
                      />
                    </Field>
                    <Field label="Tax withheld">
                      <input
                        class={inputClass}
                        readOnly
                        value={(() => {
                          const row = withholdingLines()[index()];
                          if (!row) return "";
                          const base = Number(row.base_amount) || 0;
                          return formatMoney(base * (row.rate_pct / 100));
                        })()}
                      />
                    </Field>
                  </div>
                )}
              </For>
              <Show when={withholdingLines().length > 0}>
                <p class="text-sm text-text-secondary">
                  Total withheld: {formatMoney(totalWithheld())} — posted to EWT payable when purchase is posted to GL.
                </p>
              </Show>
            </div>
          </Show>
          <Show when={effectiveEditing()}>
            <SupplierInvoiceApprovalPanel
              supplierInvoiceId={effectiveEditing()!.id}
              progressStatus={progressStatus()}
              onChanged={() => {
                void apiFetch<SupplierInvoiceDetail>(`/api/v1/finance/supplier-invoices/${effectiveEditing()!.id}`).then((res) => {
                  if (res.success && res.data) setProgressStatus(res.data.progress_status);
                });
              }}
            />
            <EmailHistoryPanel docType="supplier_invoice" docId={effectiveEditing()?.id} />
            <ChangeLogPanel targetType="fin_supplier_invoice" targetId={effectiveEditing()!.id} />
          </Show>
        </Show>
        </LifecycleReadOnlyShell>
      </WideEntityModal>

      <OpenGRLinePickerModal
        open={grPickerOpen()}
        partnerId={partnerId()}
        partnerLabel={vendorLabel()}
        onClose={() => setGrPickerOpen(false)}
        onConfirm={(picked) => void applyGRLines(picked)}
      />

      <OpenPOLinePickerModal
        open={poPickerOpen()}
        partnerId={partnerId()}
        partnerLabel={vendorLabel()}
        onClose={() => setPoPickerOpen(false)}
        onConfirm={(picked) => void applyPOLines(picked)}
      />

      <OpenSupplierQuotationLinePickerModal
        open={rfqPickerOpen()}
        partnerId={partnerId()}
        onClose={() => setRfqPickerOpen(false)}
        onConfirm={(picked) => void applySupplierQuotationLines(picked)}
      />

      <SalesSideOrderLinePickerModal
        open={soPickerOpen()}
        onClose={() => setSoPickerOpen(false)}
        onConfirm={(picked: PickedSalesOrderLine[]) =>
          void mapSellingOntoPurchase(
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

      <QuotationLinePickerModal
        open={quotationPickerOpen()}
        onClose={() => setQuotationPickerOpen(false)}
        onConfirm={(picked: PickedQuotationLine[]) =>
          void mapSellingOntoPurchase(
            picked.map((r) => ({
              item_id: r.item_id,
              item_code: r.item_code,
              item_name: r.item_name,
              balance_qty: r.balance_qty > 0 ? r.balance_qty : r.qty,
              unit_vat_inc: r.unit_vat_inc,
            })),
          )
        }
      />

      <HistoryLogModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        targetType="fin_supplier_invoice"
        targetId={effectiveEditing()?.id}
        title="History — Purchase"
      />

      <QuickCustomerModal
        open={showNewVendor()}
        partnerKind="vendor"
        initialName={newVendorName()}
        onClose={() => setShowNewVendor(false)}
        onCreated={(p) => {
          setPartnerId(p.id);
          setVendorLabel(p.company_name);
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
          void recalculatePurchaseRequestLines(lines(), t.id, t).then(setLines);
        }}
      />

      <SupplierInvoicePostSaveDialog
        open={postSaveOpen()}
        invoiceNo={createdInvoice()?.invoice_no ?? invoiceNo()}
        amount={createdInvoice()?.grand_total ?? 0}
        hasSerials={lines().some((ln) => (ln.planned_serial_nos?.length ?? 0) > 0)}
        accounting={postSaveAccounting()}
        onDone={() => {
          setPostSaveOpen(false);
          props.onClose();
        }}
        onAccounting={() => {
          setPostSaveOpen(false);
          setActiveTab("invoice");
        }}
        onCashPayment={() => {
          setPostSaveOpen(false);
          setCashPaymentOpen(true);
        }}
      />

      <Show when={createdInvoice()}>
        <CashPaymentToVendorModal
          open={cashPaymentOpen()}
          supplierInvoiceId={createdInvoice()!.id}
          partnerId={createdInvoice()!.partner_id}
          currencyId={createdInvoice()!.currency_id}
          amount={createdInvoice()!.grand_total}
          invoiceNo={createdInvoice()!.invoice_no}
          paymentDate={createdInvoice()!.invoice_date || invoiceDate()}
          onClose={() => {
            setCashPaymentOpen(false);
            props.onClose();
          }}
          onSaved={() => {
            props.onSaved();
            setCashPaymentOpen(false);
            props.onClose();
          }}
        />
      </Show>
    </>
  );
}
