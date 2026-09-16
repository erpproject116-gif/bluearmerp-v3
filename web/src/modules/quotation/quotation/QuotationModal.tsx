import { createEffect, createSignal, For, Show, Suspense, lazy } from "solid-js";
import { useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../../shared/api";
import { getActiveBranchCurrent } from "../../../shared/activeContext";
import { takeDocSeed } from "../../../shared/docSeed";
import type { LookupOption } from "../../../shared/LookupCombo";
import { DateInput } from "../../../shared/DateInput";
import { ModalField } from "../../../shared/ModalField";
import { ModalLookupField } from "../../../shared/ModalLookupField";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { QUOTATION_ENTITY } from "../../../shared/entityTypes";
import { handleSaveResult, collectRequiredFieldErrors, showClientValidationBlocker } from "../../../shared/handleSaveResult";
import { FormErrorSummary } from "../../../shared/FormErrorSummary";
import { collectDocumentLookupErrors } from "../../../shared/documentFormValidation";
import { mergeFormErrors } from "../../../shared/formValidation";
import { CoaSetupReminder } from "../../../shared/CoaSetupReminder";
import { useDocumentDraft } from "../../../shared/useDocumentDraft";
import { useToast } from "../../../shared/toast";
import { buildRequiredChecksForSave, useFormFieldSettings } from "../../../shared/useFormFieldSettings";
import {
  CustomFieldsSection,
  collectCustomFieldErrors,
  isPersonalBirthdayCustomField,
} from "../../../shared/CustomFieldsSection";
import { useCustomValues } from "../../../shared/useCustomValues";
import { WideEntityModal } from "../../../shared/WideEntityModal";
import { ModuleIcon } from "../../../shell/ModuleIcon";
import { ModalFormGuide } from "../../../shared/ModalFormGuide";
import { LifecycleReadOnlyShell } from "../../../shared/documentLifecycle";
import { ChangeLogPanel } from "../../../shared/ChangeLogPanel";
import { HistoryLogModal } from "../../../shared/HistoryLogModal";
import { AttachmentsField } from "../../../shared/AttachmentsField";
import { uiLabel } from "../../../shared/branding/uiLabel";
import { SendEmailModal } from "../../comms/SendEmailModal";
import { ShareToChatModal } from "../../comms/ShareToChatModal";
import { buildDocumentEmailSubject, buildDocumentEmailBody, firstLineItemName } from "../../comms/documentEmailSubject";
import { EmailHistoryPanel } from "../../comms/EmailHistoryPanel";
import { fetchQuotationPrint } from "./quotationPrint";
import { hasPermission, useAuth } from "../../../shared/auth-context";
import { useProcessPolicy, policyRequiresAttachment, validateAttachmentBeforeConfirm, toastAttachmentRequired } from "../../../shared/useProcessPolicy";
import { QuickCustomerModal } from "../../../shared/QuickCustomerModal";
import { QuickLocationModal } from "../../../shared/QuickLocationModal";
import { QuickTaxTypeModal } from "../../../shared/QuickTaxTypeModal";
import { LoadSlipMenu, QUOTATION_LOAD_SLIP_OPTIONS, filterLoadSlipOptions } from "../../../shared/LoadSlipMenu";
import { QuotationProfitModal, type ProfitLineRow } from "./QuotationProfitModal";
import { PurchaseRequestLinePickerModal } from "../../purchase-request/purchase-order/PurchaseRequestLinePickerModal";
import { OpenPOLinePickerModal } from "../../finance/supplier-invoices/OpenPOLinePickerModal";
import type { OpenPOLine } from "../../../shared/useSupplierInvoiceList";
import { ProgressStatusMenu } from "./ProgressStatusMenu";
import {
  QuotationLineGrid,
  emptyQuotationLine,
  recalculateQuotationLines,
  type QuotationLineRow,
} from "./QuotationLineGrid";
import { defaultInputBasis, formatRateSummary, formatTaxTypeLabel } from "../../../shared/taxcalc";
import { fetchLocationOptions, fetchPartnerOptions, useActiveCurrencies, useActiveTaxTypes } from "../../../shared/useDocumentLookups";
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
  editing: QuotationDetail | null;
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

function linesFromDetail(lines?: QuotationDetail["lines"]): QuotationLineRow[] {
  if (!lines?.length) return [emptyQuotationLine(1)];
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
    planned_serial_nos: ln.planned_serial_nos ?? [],
    track_serial: Boolean(ln.track_serial),
    serial_policy: ln.serial_policy ?? "required",
  }));
}

type RfqQuotationSeed = {
  partner_id?: number;
  partner_name?: string;
  needs_qty_review?: boolean;
  lines?: Array<{
    item_id?: number;
    item_code?: string;
    item_name?: string;
    description?: string;
    qty?: number | string;
    unit?: string;
    unit_id?: number | null;
    unit_code?: string | null;
    unit_price?: number | string;
    remarks?: string;
  }>;
};

function takeRfqQuotationSeed(): RfqQuotationSeed | null {
  try {
    const raw = sessionStorage.getItem("bluearm.rfqQuotationSeed");
    if (!raw) {
      // Baiko "open_quotation" drafts stage the generalized doc seed instead.
      return (takeDocSeed("quotation") as RfqQuotationSeed | null) ?? null;
    }
    sessionStorage.removeItem("bluearm.rfqQuotationSeed");
    const parsed = JSON.parse(raw) as RfqQuotationSeed;
    return parsed && Array.isArray(parsed.lines) ? parsed : null;
  } catch {
    sessionStorage.removeItem("bluearm.rfqQuotationSeed");
    return null;
  }
}

function linesFromRfqSeed(seed: RfqQuotationSeed): QuotationLineRow[] {
  return (seed.lines ?? []).slice(0, 200).map((line, index) => {
    const price = line.unit_price == null ? "" : String(line.unit_price);
    const base = emptyQuotationLine(index + 1, price);
    const unitId = line.unit_id ?? null;
    const unitCode = (line.unit_code ?? line.unit ?? "").trim();
    // Only fall back to a remark when the unit could not be captured structurally.
    const unresolvedUnit = !unitId && !unitCode && line.unit?.trim() ? `UOM: ${line.unit.trim()}` : "";
    const remarks = [line.remarks?.trim(), unresolvedUnit].filter(Boolean);
    return {
      ...base,
      item_id: line.item_id ?? null,
      item_code: line.item_code?.trim() ?? "",
      item_name: line.item_name?.trim() ?? "",
      description: line.description?.trim() ?? "",
      qty: line.qty == null ? "1" : String(line.qty),
      unit_id: unitId,
      unit_code: unitCode,
      remark: remarks.join(" · "),
    };
  });
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
  const QUOTATION_FORM_ID = "quotation-form";
  const [fieldErrors, setFieldErrors] = createSignal<Record<string, string | undefined>>({});
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
  const [profitOpen, setProfitOpen] = createSignal(false);
  const [profitRows, setProfitRows] = createSignal<ProfitLineRow[]>([]);
  const [profitBusy, setProfitBusy] = createSignal(false);
  const [emailOpen, setEmailOpen] = createSignal(false);
  const [shareOpen, setShareOpen] = createSignal(false);
  const [emailDefaultTo, setEmailDefaultTo] = createSignal("");
  const canShareChat = () => hasPermission(auth.me, "comms.chat", "write");
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
  const [prPickerOpen, setPrPickerOpen] = createSignal(false);
  const [poPickerOpen, setPoPickerOpen] = createSignal(false);

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

  const mapBuyingOntoQuotation = async (
    rows: Array<{
      item_id?: number | null;
      item_code: string;
      item_name: string;
      balance_qty: number;
      unit_vat_inc: number;
    }>,
  ) => {
    if (rows.length === 0) return;
    const meta = taxTypes().find((t) => t.id === taxTypeId());
    const basis = meta ? defaultInputBasis(meta.tax_mode) : "vat_inc_unit";
    const mapped = rows.map((row, i) => ({
      ...emptyQuotationLine(i + 1, String(row.unit_vat_inc), basis),
      item_id: row.item_id ?? null,
      item_code: row.item_code,
      item_name: row.item_name,
      qty: String(row.balance_qty),
      unit_price: String(row.unit_vat_inc),
    }));
    const merged = [...lines().filter((ln) => ln.item_id || ln.item_code), ...mapped].map((ln, i) => ({
      ...ln,
      line_no: i + 1,
    }));
    if (meta && taxTypeId()) {
      setLines(await recalculateQuotationLines(merged, taxTypeId()!, meta));
    } else {
      setLines(merged);
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
  let seededNewLines = false;

  createEffect(() => {
    if (!props.open) {
      initializedKey = null;
      seededNewLines = false;
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
      setCustomerLabel(ed.customer_name ?? "");
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
      const rfqSeed = takeRfqQuotationSeed();
      const rfqLines = rfqSeed ? linesFromRfqSeed(rfqSeed) : [];
      setOrderDate(todayISO());
      setPartnerId(rfqSeed?.partner_id ?? null);
      setCustomerLabel(rfqSeed?.partner_name ?? "");
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
      seededNewLines = rfqLines.length > 0;
      if (seededNewLines) {
        const activeTax = taxTypes().find((taxType) => taxType.id === taxTypeId());
        if (activeTax && taxTypeId()) {
          const basis = defaultInputBasis(activeTax.tax_mode);
          const seeded = rfqLines.map((line) => ({ ...line, input_basis: basis }));
          seededNewLines = false;
          setLines(seeded);
          void recalculateQuotationLines(seeded, taxTypeId()!, activeTax).then(setLines);
        } else {
          setLines(rfqLines);
        }
        if (rfqSeed?.needs_qty_review) {
          toast.warning("Baiko prefilled item lines with qty 1 — review quantities before saving.");
        }
      } else {
        setLines([emptyQuotationLine(1)]);
      }
      loadCustom({});
      void loadPreview(todayISO());
    }
  });

  let appliedNewDefaults = false;
  createEffect(() => {
    if (!props.open) {
      appliedNewDefaults = false;
      return;
    }
    if (props.editing) return;
    const tt = taxTypes();
    const cc = currencies();
    if (!tt.length || !cc.length) return;
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
        void recalculateQuotationLines(seeded, first.id, first).then(setLines);
      } else {
        setLines([emptyQuotationLine(1, "", basis)]);
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

  const save = async () => {
    if (props.readOnly) return;
    setFieldErrors({});
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
    const processCustomFields = activeCustomFields().filter((d) => !isPersonalBirthdayCustomField(d));
    const validationErrors = mergeFormErrors(
      collectDocumentLookupErrors({
        tax_type_id: taxTypeId(),
        currency_id: currencyId(),
        partner_id: partnerId(),
        location_id: locationId(),
      }),
      collectRequiredFieldErrors(formValues, checks),
      collectCustomFieldErrors(customValues(), processCustomFields),
    );
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      showClientValidationBlocker(validationErrors, toast);
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
      toastAttachmentRequired(toast, "quotation", attachmentErr);
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
        unit_id: ln.unit_id || null,
        unit_code: ln.unit_code || null,
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
      handleSaveResult(
        res,
        toast,
        props.editing
          ? "Quotation saved. Convert to Sales Order when the customer confirms."
          : "Quotation created. Send it, then convert to Sales Order when confirmed.",
        {
        onFieldErrors: setFieldErrors,
      });
      return;
    }
    toast.success(props.editing ? "Quotation updated." : "Quotation created.");
    await draft.clearOnSave();
    props.onSaved();
    props.onClose();
  };

  const openEmail = async () => {
    const ed = effectiveEditing();
    if (!ed?.id) return;
    const res = await fetchQuotationPrint(ed.id);
    setEmailDefaultTo(res.data?.partner.email ?? "");
    setEmailOpen(true);
  };

  const runVerification = () => {
    const issues: string[] = [];
    if (!partnerId()) issues.push("Customer is required.");
    if (!taxTypeId()) issues.push("Transaction type is required.");
    if (!locationId()) issues.push("Location is required.");
    const filled = lines().filter((ln) => ln.item_id || ln.item_code || ln.item_name);
    if (filled.length === 0) issues.push("Add at least one line.");
    for (const ln of filled) {
      const qty = Number(ln.qty);
      const price = Number(ln.unit_price);
      if (!(qty > 0)) issues.push(`Line ${ln.line_no}: qty must be greater than 0.`);
      if (!(price >= 0) || ln.unit_price === "") issues.push(`Line ${ln.line_no}: price is required.`);
      if (!(ln.item_code || ln.item_name)) issues.push(`Line ${ln.line_no}: item code or name is required.`);
    }
    if (issues.length) {
      toast.warning(issues.slice(0, 4).join(" "));
      return;
    }
    toast.success(`Verification OK — ${filled.length} line(s).`);
  };

  const runCalculateProfit = async () => {
    if (!taxTypeId()) {
      toast.warning("Select transaction type (tax) before Calculate Profit.");
      return;
    }
    if (!currencyId()) {
      toast.warning("Select currency before Calculate Profit.");
      return;
    }
    const filled = lines().filter((ln) => ln.item_id || ln.item_code || ln.item_name);
    if (filled.length === 0) {
      toast.warning("Add at least one line before Calculate Profit.");
      return;
    }
    setProfitBusy(true);
    const rows: ProfitLineRow[] = [];
    for (const ln of filled) {
      const qty = Number(ln.qty) || 0;
      const sellUnit = Number(ln.unit_non_vat) || Number(ln.unit_price) || 0;
      const sellTotal = Number(ln.non_vat_total) || sellUnit * qty;
      let costUnit: number | null = null;
      if (ln.item_id || ln.item_code) {
        const qs = new URLSearchParams({
          page: "1",
          pageSize: "5",
          status: "active",
          q: ln.item_code || String(ln.item_id),
        });
        const res = await apiFetch<
          { id: number; item_code: string; purchase_price: number; standard_costs?: Record<string, number> }[]
        >(`/api/v1/inventory/items?${qs}`);
        const hit =
          res.data?.find((i) => ln.item_id && i.id === ln.item_id) ??
          res.data?.find((i) => i.item_code.toLowerCase() === (ln.item_code || "").toLowerCase()) ??
          res.data?.[0];
        if (hit) {
          const std =
            hit.standard_costs &&
            Object.values(hit.standard_costs).reduce((a, b) => a + (Number(b) || 0), 0);
          if (std && std > 0) costUnit = std;
          else if (hit.purchase_price > 0) costUnit = hit.purchase_price;
        }
      }
      const costTotal = costUnit != null ? costUnit * qty : null;
      const margin = costTotal != null ? sellTotal - costTotal : null;
      const marginPct = margin != null && sellTotal > 0 ? (margin / sellTotal) * 100 : null;
      rows.push({
        line_no: ln.line_no,
        item_code: ln.item_code,
        item_name: ln.item_name,
        qty,
        sell_unit: sellUnit,
        sell_total: sellTotal,
        cost_unit: costUnit,
        cost_total: costTotal,
        margin,
        margin_pct: marginPct,
      });
    }
    setProfitBusy(false);
    setProfitRows(rows);
    setProfitOpen(true);
  };

  return (
    <>
    <WideEntityModal
      open={props.open}
      title={effectiveEditing() ? (props.readOnly ? "View Quotation (deleted)" : "Edit Quotation") : "New Quotation"}
      icon={<ModuleIcon id="quotation" class="h-5 w-5" />}
      onClose={() => props.onClose()}
      onSave={() => void save()}
      readOnly={props.readOnly}
      saving={saving()}
      headerActions={
        <>
          <button
            type="button"
            class="rounded-lg border border-stroke px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-slate-50 disabled:opacity-50"
            disabled={props.readOnly}
            onClick={runVerification}
          >
            Verification
          </button>
          <button
            type="button"
            class="rounded-lg border border-stroke px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-slate-50 disabled:opacity-50"
            disabled={props.readOnly || profitBusy()}
            onClick={() => void runCalculateProfit()}
          >
            {profitBusy() ? "Profit…" : "Calculate Profit"}
          </button>
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
            <Show when={canShareChat()}>
              <button
                type="button"
                class="rounded-lg border border-stroke px-3 py-1.5 text-sm font-medium text-brand-600 hover:bg-slate-50"
                onClick={() => setShareOpen(true)}
                aria-label="Share to Team Chat"
              >
                Share to chat
              </button>
            </Show>
            <button type="button" class="rounded-lg border border-stroke px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-slate-50" onClick={() => setHistoryOpen(true)}>
              History
            </button>
          </Show>
        </>
      }
    >
      <LifecycleReadOnlyShell readOnly={props.readOnly ?? false}>
      <ModalFormGuide guideId="quotation" />
      <FormErrorSummary errors={fieldErrors} />
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
        forceVisible
        forceRequired
        formId={QUOTATION_FORM_ID}
        errors={fieldErrors}
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
      <ModalField
        settings={byKey}
        fieldKey="currency_id"
        fallbackLabel="Currency"
        fallbackRequired
        forceVisible
        forceRequired
        formId={QUOTATION_FORM_ID}
        errors={fieldErrors}
      >
        {(m) => (
          <select
            {...m.inputProps}
            class={inputClass}
            value={currencyId() ?? ""}
            disabled={m.disabled}
            onChange={(e) => {
              setFieldErrors((prev) => {
                const next = { ...prev };
                delete next.currency_id;
                return next;
              });
              setCurrencyId(Number(e.currentTarget.value) || null);
            }}
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
        formId={QUOTATION_FORM_ID}
        errors={fieldErrors}
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
      <ModalLookupField
        settings={byKey}
        fieldKey="location_id"
        fallbackLabel="Location-Out"
        fallbackRequired
        formId={QUOTATION_FORM_ID}
        errors={fieldErrors}
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
        excludeDef={isPersonalBirthdayCustomField}
      />
      </div>
      <div class="col-span-full mb-2 flex flex-wrap items-center gap-2">
        <LoadSlipMenu
          options={filterLoadSlipOptions(QUOTATION_LOAD_SLIP_OPTIONS, auth.me)}
          onSelect={(id) => {
            if (id === "quotation") setQuotationPickerOpen(true);
            if (id === "pr") setPrPickerOpen(true);
            if (id === "po") setPoPickerOpen(true);
            if (id === "rfq") setRfqImportOpen(true);
          }}
        />
      </div>
      <p class="col-span-full mb-2 text-xs text-text-secondary">
        You can type product names that are not yet in Inventory. Product registration is required from Sales Order, Sales, Purchase Order, and Purchases onward.
      </p>
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

    <QuotationProfitModal
      open={profitOpen()}
      rows={profitRows()}
      taxTypeLabel={taxTypeLabel() || selectedTaxType()?.name || "—"}
      currencyCode={currencies().find((c) => c.id === currencyId())?.currency_code ?? "—"}
      onClose={() => setProfitOpen(false)}
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
        void recalculateQuotationLines(lines(), t.id, t).then(setLines);
      }}
    />

    <SendEmailModal
      open={emailOpen()}
      onClose={() => setEmailOpen(false)}
      title="Email quotation"
      sendUrl={`/api/v1/quotation/quotations/${effectiveEditing()?.id ?? 0}/send-email`}
      defaultTo={emailDefaultTo()}
      defaultSubject={buildDocumentEmailSubject(
        firstLineItemName(lines()),
        "Quotation",
        auth.me?.tenant.company_name,
      )}
      defaultBody={buildDocumentEmailBody({
        docTypeLabel: "Quotation",
        partyLabel: "Customer",
        partyName: customerLabel(),
        referenceNo: referenceNo(),
        dateLabel: "Date",
        date: orderDate(),
        currencyCode: currencies().find((c) => c.id === currencyId())?.currency_code,
        grandTotal: lines().reduce((s, ln) => s + (Number(ln.line_total) || 0), 0),
        paymentTerms: paymentTerms(),
        notes: notes(),
        lines: lines(),
        companyName: auth.me?.tenant.company_name,
      })}
    />
    <ShareToChatModal
      open={shareOpen()}
      onClose={() => setShareOpen(false)}
      entityType="quo_quotation"
      entityId={effectiveEditing()?.id ?? 0}
      label={referenceNo() || "Quotation"}
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
    <PurchaseRequestLinePickerModal
      open={prPickerOpen()}
      onClose={() => setPrPickerOpen(false)}
      onConfirm={(picked) =>
        void mapBuyingOntoQuotation(
          picked.map((r) => ({
            item_id: r.item_id,
            item_code: r.item_code,
            item_name: r.item_name,
            balance_qty: r.balance_qty,
            unit_vat_inc: r.unit_vat_inc,
          })),
        )
      }
    />
    <OpenPOLinePickerModal
      open={poPickerOpen()}
      mapOnly
      onClose={() => setPoPickerOpen(false)}
      onConfirm={(picked: OpenPOLine[]) => void mapBuyingOntoQuotation(picked)}
    />
    </>
  );
}
