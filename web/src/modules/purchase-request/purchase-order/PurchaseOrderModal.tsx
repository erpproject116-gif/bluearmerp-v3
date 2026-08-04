import { createEffect, createSignal, For, Show } from "solid-js";
import { useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../../shared/api";
import { getActiveBranchCurrent } from "../../../shared/activeContext";
import type { LookupOption } from "../../../shared/LookupCombo";
import { DateInput } from "../../../shared/DateInput";
import { ModalField } from "../../../shared/ModalField";
import { ModalLookupField } from "../../../shared/ModalLookupField";
import { inputClass } from "../../../shared/SpreadsheetGrid";
import { handleSaveResult, requireFields } from "../../../shared/handleSaveResult";
import { buildRequiredChecks, useFormFieldSettings } from "../../../shared/useFormFieldSettings";
import { PURCHASE_REQUEST_ENTITY } from "../../../shared/entityTypes";
import { useToast } from "../../../shared/toast";
import { useAuth, hasPermission } from "../../../shared/auth-context";
import { formatRateSummary, formatTaxTypeLabel, defaultInputBasis } from "../../../shared/taxcalc";
import {
  ACTIVE_CURRENCIES_KEY,
  ACTIVE_TAX_TYPES_KEY,
  fetchLocationOptions,
  fetchPartnerOptions,
  loadActiveCurrencies,
  loadActiveTaxTypes,
  useActiveCurrencies,
  useActiveTaxTypes,
} from "../../../shared/useDocumentLookups";
import { WideEntityModal } from "../../../shared/WideEntityModal";
import { ModalFormGuide } from "../../../shared/ModalFormGuide";
import { LifecycleReadOnlyShell, withLifecycleParam, type LifecycleFilter } from "../../../shared/documentLifecycle";
import { ChangeLogPanel } from "../../../shared/ChangeLogPanel";
import { HistoryLogModal } from "../../../shared/HistoryLogModal";
import { AttachmentsField } from "../../../shared/AttachmentsField";
import { uiLabel } from "../../../shared/branding/uiLabel";
import { EmailHistoryPanel } from "../../comms/EmailHistoryPanel";
import { useProcessPolicy, policyRequiresAttachment } from "../../../shared/useProcessPolicy";
import { LoadSlipMenu, PURCHASE_ORDER_LOAD_SLIP_OPTIONS, filterLoadSlipOptions } from "../../../shared/LoadSlipMenu";
import { DocumentEmailToolbar } from "../../comms/DocumentEmailToolbar";
import { buildDocumentEmailSubject, buildDocumentEmailBody, firstLineItemName } from "../../comms/documentEmailSubject";
import { QuickCustomerModal } from "../../../shared/QuickCustomerModal";
import { QuickLocationModal } from "../../../shared/QuickLocationModal";
import { QuickTaxTypeModal } from "../../../shared/QuickTaxTypeModal";
import {
  PurchaseRequestLineGrid,
  emptyPurchaseRequestLine,
  recalculatePurchaseRequestLines,
  type PurchaseRequestLineRow,
} from "../purchase-request/PurchaseRequestLineGrid";
import { docSeedLinePatch, takeDocSeed } from "../../../shared/docSeed";
import { PurchaseRequestLinePickerModal, type PickedPurchaseRequestLine } from "./PurchaseRequestLinePickerModal";
import {
  SupplierQuotationLinePickerModal,
  type PickedSupplierQuotationLine,
} from "./SupplierQuotationLinePickerModal";
import {
  SalesOrderLinePickerModal as SalesSideOrderLinePickerModal,
  type PickedSalesOrderLine,
} from "../../sales/sales/SalesOrderLinePickerModal";
import {
  QuotationLinePickerModal,
  type PickedQuotationLine,
} from "../../sales-order/sales-order/QuotationLinePickerModal";
import { formatMoney } from "../purchase-request/purchaseRequestPrint";
import { LoadingText } from "../../../shared/LoadingText";
import { useDocumentDraft } from "../../../shared/useDocumentDraft";

type PoDraftPayload = {
  order_date: string;
  tax_type_id: number | null;
  currency_id: number | null;
  pic_user_id: number | null;
  pic_name: string;
  location_id: number | null;
  location_label: string;
  project_id: number | null;
  project_label: string;
  project_name: string;
  reference: string;
  notes: string;
  partner_id: number | null;
  partner_label: string;
  partner_code: string;
  lines: PurchaseRequestLineRow[];
};

export type PurchaseOrderDetail = {
  id: number;
  order_date: string;
  date_seq: number;
  date_no_display: string;
  purchase_order_no: string;
  purchase_request_id?: number | null;
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
  status: string;
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
    received_qty?: number;
    unit_id?: number | null;
    unit_code?: string | null;
    unit_non_vat: number;
    non_vat_total: number;
    tax_amount: number;
    unit_vat_inc: number;
    line_total: number;
    remark?: string | null;
    purchase_request_line_id?: number | null;
    planned_serial_nos?: string[];
    track_serial?: boolean;
    serial_policy?: string;
  }>;
};

type Props = {
  open: boolean;
  purchaseOrderId: number | null;
  /** Deleted (soft-deleted) document opened for viewing — no edits allowed. */
  readOnly?: boolean;
  /** Lifecycle scope for the detail fetch (needed to load deleted records). */
  lifecycle?: LifecycleFilter;
  onClose: () => void;
  onSaved: () => void;
};

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

function linesFromDetail(lines?: PurchaseOrderDetail["lines"]): PurchaseRequestLineRow[] {
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
    purchase_request_line_id: ln.purchase_request_line_id ?? null,
    planned_serial_nos: ln.planned_serial_nos ?? [],
    track_serial: Boolean(ln.track_serial),
    serial_policy: ln.serial_policy ?? "required",
  }));
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

export function PurchaseOrderModal(props: Props) {
  const queryClient = useQueryClient();
  const auth = useAuth();
  const toast = useToast();
  const processPolicy = useProcessPolicy(() => props.open);
  const { fields, byKey } = useFormFieldSettings(PURCHASE_REQUEST_ENTITY.purchaseOrder);
  const [_attachmentCount, setAttachmentCount] = createSignal(0);
  const taxTypesQuery = useActiveTaxTypes(() => props.open);
  const currenciesQuery = useActiveCurrencies(() => props.open);
  const taxTypes = () => taxTypesQuery.data ?? [];
  const currencies = () => currenciesQuery.data ?? [];
  const [loading, setLoading] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [historyOpen, setHistoryOpen] = createSignal(false);
  const [prPickerOpen, setPrPickerOpen] = createSignal(false);
  const [sqPickerOpen, setSqPickerOpen] = createSignal(false);
  const [soPickerOpen, setSoPickerOpen] = createSignal(false);
  const [quotationPickerOpen, setQuotationPickerOpen] = createSignal(false);
  const [showNewVendor, setShowNewVendor] = createSignal(false);
  const [newVendorName, setNewVendorName] = createSignal("");
  const [showNewLocation, setShowNewLocation] = createSignal(false);
  const [newLocationName, setNewLocationName] = createSignal("");
  const [showNewTaxType, setShowNewTaxType] = createSignal(false);
  const [newTaxTypeName, setNewTaxTypeName] = createSignal("");
  const [detail, setDetail] = createSignal<PurchaseOrderDetail | null>(null);
  const [savedPoId, setSavedPoId] = createSignal<number | null>(null);
  const effectivePoId = () => props.purchaseOrderId ?? savedPoId();

  const [orderDate, setOrderDate] = createSignal("");
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
  const [reference, setReference] = createSignal("");
  const [notes, setNotes] = createSignal("");
  const [partnerId, setPartnerId] = createSignal<number | null>(null);
  const [partnerLabel, setPartnerLabel] = createSignal("");
  const [partnerCode, setPartnerCode] = createSignal("");
  const [lines, setLines] = createSignal<PurchaseRequestLineRow[]>([emptyPurchaseRequestLine(1)]);

  const isCreate = () => props.open && effectivePoId() == null;
  const isDraft = () => isCreate() || detail()?.status === "draft";
  const readOnly = () => Boolean(props.readOnly) || !isDraft();
  const selectedTaxType = () => taxTypes().find((t) => t.id === taxTypeId()) ?? null;

  createEffect(() => {
    const id = taxTypeId();
    if (id == null || taxTypeLabel()) return;
    const meta = taxTypes().find((t) => t.id === id);
    if (meta) setTaxTypeLabel(formatTaxTypeLabel(meta.name, meta.tax_mode, meta.rate_percent));
  });

  const buildDraftPayload = (): PoDraftPayload => ({
    order_date: orderDate(),
    tax_type_id: taxTypeId(),
    currency_id: currencyId(),
    pic_user_id: picUserId(),
    pic_name: picName(),
    location_id: locationId(),
    location_label: locationLabel(),
    project_id: projectId(),
    project_label: projectLabel(),
    project_name: projectName(),
    reference: reference(),
    notes: notes(),
    partner_id: partnerId(),
    partner_label: partnerLabel(),
    partner_code: partnerCode(),
    lines: lines(),
  });

  const applyDraftPayload = (payload: PoDraftPayload) => {
    setOrderDate(payload.order_date);
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
    setReference(payload.reference);
    setNotes(payload.notes);
    setPartnerId(payload.partner_id);
    setPartnerLabel(payload.partner_label);
    setPartnerCode(payload.partner_code);
    setLines(payload.lines?.length ? payload.lines : [emptyPurchaseRequestLine(1)]);
  };

  const draft = useDocumentDraft({
    entityType: PURCHASE_REQUEST_ENTITY.purchaseOrder,
    draftKey: () => (effectivePoId() ? `edit-${effectivePoId()}` : "new"),
    getPayload: buildDraftPayload,
    onApply: applyDraftPayload,
    enabled: () => props.open && isDraft(),
    // No autoApply here: initNew()/loadDetail() above are themselves async (they await
    // ensureQueryData/apiFetch), so there's no guaranteed ordering against this draft's own
    // async recovery — autoApply could race and get clobbered. Banner-only avoids that.
  });

  const applyDetail = (po: PurchaseOrderDetail) => {
    setDetail(po);
    setOrderDate(po.order_date);
    setTaxTypeId(po.tax_type_id);
    setTaxTypeLabel(po.tax_type_name ?? "");
    setCurrencyId(po.currency_id);
    setPicUserId(po.pic_user_id ?? null);
    setPicName(po.pic_name);
    setLocationId(po.location_id);
    setLocationLabel(po.location_name ?? "");
    setProjectId(po.project_id ?? null);
    setProjectLabel(po.project_name ?? "");
    setProjectName(po.project_name ?? "");
    setReference(po.reference ?? "");
    setNotes(po.notes ?? "");
    setPartnerId(po.partner_id ?? null);
    setPartnerLabel(po.partner_name ?? "");
    setPartnerCode(po.lines?.[0]?.partner_code ?? "");
    setLines(linesFromDetail(po.lines));
  };

  const loadDetail = async (id: number) => {
    setLoading(true);
    const [poRes] = await Promise.all([
      apiFetch<PurchaseOrderDetail>(
        withLifecycleParam(`/api/v1/purchase-order/purchase-orders/${id}`, props.lifecycle ?? "active"),
      ),
      queryClient.ensureQueryData({ queryKey: ACTIVE_TAX_TYPES_KEY, queryFn: loadActiveTaxTypes }),
      queryClient.ensureQueryData({ queryKey: ACTIVE_CURRENCIES_KEY, queryFn: loadActiveCurrencies }),
    ]);
    setLoading(false);
    if (!poRes.success || !poRes.data) {
      toast.warning(poRes.message ?? "Failed to load purchase order.");
      props.onClose();
      return;
    }
    applyDetail(poRes.data);
  };

  const initNew = async () => {
    setLoading(true);
    setDetail(null);
    const [tt, cc] = await Promise.all([
      queryClient.ensureQueryData({ queryKey: ACTIVE_TAX_TYPES_KEY, queryFn: loadActiveTaxTypes }),
      queryClient.ensureQueryData({ queryKey: ACTIVE_CURRENCIES_KEY, queryFn: loadActiveCurrencies }),
    ]);
    const seed = takeDocSeed("purchase_order");
    const seedLines = (seed?.lines ?? []).slice(0, 200).map((line, index) => ({
      ...emptyPurchaseRequestLine(index + 1),
      ...docSeedLinePatch(line),
    }));
    setOrderDate(todayISO());
    setPicUserId(null);
    setPicName("");
    const branch = getActiveBranchCurrent();
    setLocationId(branch?.id ?? null);
    setLocationLabel(branch?.name ?? "");
    setProjectId(null);
    setProjectLabel("");
    setProjectName("");
    setReference("");
    setNotes("");
    setPartnerId(seed?.partner_id ?? null);
    setPartnerLabel(seed?.partner_name ?? "");
    setPartnerCode(seed?.partner_code ?? "");
    if (tt.length) {
      const first = tt[0];
      setTaxTypeId(first.id);
      setTaxTypeLabel(formatTaxTypeLabel(first.name, first.tax_mode, first.rate_percent));
      const basis = defaultInputBasis(first.tax_mode);
      if (seedLines.length > 0) {
        const seeded = seedLines.map((line) => ({ ...line, input_basis: basis }));
        setLines(await recalculatePurchaseRequestLines(seeded, first.id, first));
      } else {
        setLines([emptyPurchaseRequestLine(1, "", basis)]);
      }
    } else {
      setTaxTypeId(null);
      setTaxTypeLabel("");
      setLines(seedLines.length > 0 ? seedLines : [emptyPurchaseRequestLine(1)]);
    }
    if (seedLines.length > 0 && seed?.needs_qty_review) {
      toast.warning("Baiko prefilled item lines with qty 1 — review quantities before saving.");
    }
    const def = cc.find((c) => c.is_default) ?? cc[0];
    setCurrencyId(def?.id ?? null);
    setLoading(false);
  };

  createEffect(() => {
    if (!props.open) {
      setSavedPoId(null);
      return;
    }
    if (props.purchaseOrderId) void loadDetail(props.purchaseOrderId);
    else if (!savedPoId()) void initNew();
  });

  const fetchTaxTypeOptions = async (q: string): Promise<LookupOption[]> => {
    const qq = q.trim().toLowerCase();
    return taxTypes()
      .filter((t) => !qq || t.name.toLowerCase().includes(qq))
      .map((t) => ({ id: t.id, label: formatTaxTypeLabel(t.name, t.tax_mode, t.rate_percent) }));
  };

  const onTaxTypeChange = async (newId: number | null) => {
    if (readOnly()) return;
    setTaxTypeId(newId);
    const meta = taxTypes().find((t) => t.id === newId);
    setTaxTypeLabel(meta ? formatTaxTypeLabel(meta.name, meta.tax_mode, meta.rate_percent) : "");
    if (!newId || !meta) return;
    const recalc = await recalculatePurchaseRequestLines(lines(), newId, meta);
    setLines(recalc);
  };

  const applyPurchaseRequestLines = async (picked: PickedPurchaseRequestLine[]) => {
    if (picked.length === 0) return;
    const first = picked[0];
    setTaxTypeId(first.tax_type_id);
    setCurrencyId(first.currency_id);
    setLocationId(first.location_id);
    setLocationLabel(first.location_name);
    if (first.pic_name) setPicName(first.pic_name);
    if (first.partner_id) {
      setPartnerId(first.partner_id);
      setPartnerLabel(first.partner_name);
      setPartnerCode(first.partner_code);
    }

    const meta = taxTypes().find((t) => t.id === first.tax_type_id);
    setTaxTypeLabel(meta ? formatTaxTypeLabel(meta.name, meta.tax_mode, meta.rate_percent) : "");
    const basis = meta ? defaultInputBasis(meta.tax_mode) : "vat_inc_unit";
    const newLines: PurchaseRequestLineRow[] = picked.map((row, i) => ({
      ...emptyPurchaseRequestLine(i + 1, String(row.unit_price), basis),
      item_id: row.item_id ?? null,
      item_code: row.item_code,
      item_name: row.item_name,
      spec_name: row.spec_name ?? "",
      description: row.description ?? "",
      qty: String(row.balance_qty),
      unit_id: row.unit_id ?? null,
      unit_code: row.unit_code ?? "",
      unit_price: String(row.unit_price),
      remark: row.remark ?? "",
      purchase_request_line_id: row.source_purchase_request_line_id,
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

  const applySupplierQuotationLines = async (picked: PickedSupplierQuotationLine[]) => {
    if (picked.length === 0) return;
    const first = picked[0];
    if (first.tax_type_id) setTaxTypeId(first.tax_type_id);
    if (first.currency_id) setCurrencyId(first.currency_id);
    if (first.location_id) {
      setLocationId(first.location_id);
      setLocationLabel(first.location_name);
    }
    if (first.pic_name) setPicName(first.pic_name);
    setPartnerId(first.partner_id);
    setPartnerLabel(first.partner_name);
    setPartnerCode("");

    const meta = taxTypes().find((t) => t.id === first.tax_type_id);
    setTaxTypeLabel(meta ? formatTaxTypeLabel(meta.name, meta.tax_mode, meta.rate_percent) : taxTypeLabel());
    const basis = meta ? defaultInputBasis(meta.tax_mode) : "vat_inc_unit";
    const newLines: PurchaseRequestLineRow[] = picked.map((row, i) => ({
      ...emptyPurchaseRequestLine(i + 1, String(row.unit_price), basis),
      item_id: row.item_id ?? null,
      item_code: row.item_code,
      item_name: row.item_name,
      qty: String(row.balance_qty),
      unit_id: row.unit_id ?? null,
      unit_code: row.unit_code ?? "",
      unit_price: String(row.unit_price),
      supplier_quotation_line_id: row.source_supplier_quotation_line_id,
      rfq_request_line_id: row.rfq_request_line_id ?? null,
    }));
    if (meta && first.tax_type_id) {
      const recalc = await recalculatePurchaseRequestLines(newLines, first.tax_type_id, meta);
      setLines(recalc);
    } else {
      setLines(newLines);
    }
  };

  /** Cross-side map from Selling — never adopt customer as vendor. */
  const mapSellingOntoPurchaseOrder = async (
    rows: Array<{
      item_id?: number | null;
      item_code: string;
      item_name: string;
      balance_qty: number;
      unit_vat_inc: number;
      track_serial?: boolean;
      location_id?: number;
      location_name?: string;
      tax_type_id?: number;
      currency_id?: number;
      pic_name?: string;
    }>,
  ) => {
    if (rows.length === 0) return;
    const first = rows[0];
    if (first.tax_type_id && !taxTypeId()) {
      setTaxTypeId(first.tax_type_id);
      const meta0 = taxTypes().find((t) => t.id === first.tax_type_id);
      if (meta0) setTaxTypeLabel(formatTaxTypeLabel(meta0.name, meta0.tax_mode, meta0.rate_percent));
    }
    if (first.currency_id && !currencyId()) setCurrencyId(first.currency_id);
    if (first.location_id && !locationId()) {
      setLocationId(first.location_id);
      setLocationLabel(first.location_name ?? "");
    }
    if (first.pic_name && !picName()) setPicName(first.pic_name);
    const meta = taxTypes().find((t) => t.id === taxTypeId());
    const basis = meta ? defaultInputBasis(meta.tax_mode) : "vat_inc_unit";
    const mapped = rows.map((row, i) => ({
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

  const save = async () => {
    if (!isDraft()) return;
    if (!taxTypeId() || !currencyId() || !locationId()) {
      toast.warning("Transaction type, currency, and location are required.");
      return;
    }
    const vendorId = partnerId();
    if (!vendorId) {
      toast.warning("Vendor is required.");
      return;
    }

    const formValues = {
      order_date: orderDate(),
      partner_id: vendorId,
      location_id: locationId(),
      tax_type_id: taxTypeId(),
      currency_id: currencyId(),
      pic_name: picName(),
      reference: reference(),
      notes: notes(),
      project_id: projectId(),
    };
    const clientError = requireFields(formValues as Record<string, unknown>, buildRequiredChecks(fields()));
    if (clientError) {
      toast.warning(clientError);
      return;
    }

    const vendorCode = partnerCode();
    const vendorName = partnerLabel();
    const body = {
      order_date: orderDate() || todayISO(),
      partner_id: vendorId,
      tax_type_id: taxTypeId(),
      currency_id: currencyId(),
      pic_user_id: picUserId(),
      pic_name: picName(),
      location_id: locationId(),
      project_id: projectId(),
      project_name: projectName() || null,
      reference: reference() || null,
      notes: notes() || null,
      lines: lines().map((ln, i) => ({
        line_no: i + 1,
        purchase_request_line_id: ln.purchase_request_line_id ?? null,
        supplier_quotation_line_id: ln.supplier_quotation_line_id ?? null,
        rfq_request_line_id: ln.rfq_request_line_id ?? null,
        partner_id: vendorId,
        partner_code: vendorCode,
        partner_name: vendorName,
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
        planned_serial_nos: ln.planned_serial_nos ?? [],
      })),
    };

    setSaving(true);
    const poId = effectivePoId();
    const res = await (isCreate()
      ? apiFetch<PurchaseOrderDetail>("/api/v1/purchase-order/purchase-orders", {
          method: "POST",
          body: JSON.stringify(body),
        }, { silent: true })
      : apiFetch<PurchaseOrderDetail>(`/api/v1/purchase-order/purchase-orders/${poId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        }, { silent: true }));
    setSaving(false);
    if (!res.success || !res.data) {
      handleSaveResult(res, toast, isCreate() ? "Purchase order created." : "Purchase order updated.");
      return;
    }
    toast.success(isCreate() ? "Purchase order created." : "Purchase order updated.");
    await draft.clearOnSave();
    applyDetail(res.data);
    props.onSaved();
    props.onClose();
  };

  const po = () => detail();

  return (
    <>
    <WideEntityModal
      open={props.open}
      title={isCreate() ? "New Purchase Order" : po() ? `Purchase Order — ${po()!.purchase_order_no}${props.readOnly ? " (deleted)" : ""}` : "Purchase Order"}
      onClose={props.onClose}
      onSave={() => void save()}
      readOnly={readOnly()}
      saving={saving()}
      headerActions={
        <Show when={effectivePoId()}>
          <DocumentEmailToolbar
            docId={effectivePoId()}
            sendUrl="/api/v1/purchase-order/purchase-orders/{id}/send-email"
            title="Email purchase order"
            defaultSubject={buildDocumentEmailSubject(
              firstLineItemName(lines()),
              "Purchase Order",
              auth.me?.tenant.company_name,
            )}
            defaultBody={buildDocumentEmailBody({
              docTypeLabel: "Purchase Order",
              partyLabel: "Vendor",
              partyName: partnerLabel(),
              referenceNo: po()?.purchase_order_no,
              dateLabel: "Order date",
              date: orderDate(),
              currencyCode: currencies().find((c) => c.id === currencyId())?.currency_code,
              grandTotal: lines().reduce((s, ln) => s + (Number(ln.line_total) || 0), 0),
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
      <ModalFormGuide guideId="purchase_order" />
      <Show when={loading()}>
        <LoadingText class="text-sm text-text-secondary" as="p" />
      </Show>
      <draft.DraftBanner />
      <Show when={!loading() && (isCreate() || po())}>
        <Show when={po()} keyed>
        {(d) => (
          <div class="mb-4 flex flex-wrap gap-4 rounded-lg border border-stroke bg-slate-50 p-3 text-sm">
            <span>
              <span class="text-text-secondary">Status:</span>{" "}
              <span class="font-medium capitalize">{statusLabel(d.status)}</span>
            </span>
            <span>
              <span class="text-text-secondary">Date-no:</span>{" "}
              <span class="font-medium">{d.date_no_display}</span>
            </span>
            <span>
              <span class="text-text-secondary">Vendor:</span>{" "}
              <span class="font-medium">{d.partner_name}</span>
            </span>
            <span>
              <span class="text-text-secondary">Total:</span>{" "}
              <span class="font-medium">{formatMoney(d.grand_total, d.currency_code ?? "")}</span>
            </span>
          </div>
        )}
        </Show>

        <div class="space-y-4">
            <div class="grid gap-4 md:grid-cols-2">
              <ModalField settings={byKey} fieldKey="order_date" fallbackLabel="Date" fallbackRequired>
                {(m) => (
                  <DateInput
                    value={orderDate()}
                    disabled={m.disabled || readOnly()}
                    onInput={(e) => setOrderDate(e.currentTarget.value)}
                  />
                )}
              </ModalField>
              <Show
                when={isDraft()}
                fallback={
                  <ModalField settings={byKey} fieldKey="tax_type_id" fallbackLabel="Transaction type" fallbackRequired>
                    {(m) => <input class={inputClass} value={taxTypeLabel()} readOnly disabled={m.disabled} />}
                  </ModalField>
                }
              >
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
              </Show>
              <Show when={isDraft() && selectedTaxType()}>
                {(t) => (
                  <p class="mt-1 text-xs text-text-secondary md:col-span-2">{formatRateSummary(t().tax_mode, t().rate_percent)}</p>
                )}
              </Show>
              <ModalField settings={byKey} fieldKey="currency_id" fallbackLabel="Currency" fallbackRequired>
                {(m) => (
                  <select
                    class={inputClass}
                    value={currencyId() ?? ""}
                    disabled={m.disabled || readOnly()}
                    onChange={(e) => setCurrencyId(Number(e.currentTarget.value) || null)}
                  >
                    <option value="">Select…</option>
                    <For each={currencies()}>
                      {(c) => (
                        <option value={c.id}>
                          {c.currency_code} — {c.name}
                        </option>
                      )}
                    </For>
                  </select>
                )}
              </ModalField>
              <Show
                when={isDraft()}
                fallback={
                  <ModalField settings={byKey} fieldKey="partner_id" fallbackLabel="Vendor / Supplier" fallbackRequired>
                    {(m) => <input class={inputClass} value={partnerLabel()} readOnly disabled={m.disabled} />}
                  </ModalField>
                }
              >
                <ModalLookupField
                  settings={byKey}
                  fieldKey="partner_id"
                  fallbackLabel="Vendor / Supplier"
                  fallbackRequired
                  value={partnerLabel}
                  selectedId={partnerId}
                  onInput={setPartnerLabel}
                  onSelect={(o) => {
                    setPartnerId(o.id);
                    setPartnerLabel(o.label);
                    setPartnerCode(o.sublabel ?? "");
                  }}
                  onClear={() => {
                    setPartnerId(null);
                    setPartnerLabel("");
                    setPartnerCode("");
                  }}
                  fetchOptions={(q) => fetchPartnerOptions(q, "vendor", { withCode: true })}
                  createLabel="Add vendor"
                  onCreate={(q) => {
                    setNewVendorName(q);
                    setShowNewVendor(true);
                  }}
                />
              </Show>
              <Show
                when={isDraft()}
                fallback={
                  <ModalField settings={byKey} fieldKey="location_id" fallbackLabel="Location" fallbackRequired>
                    {(m) => <input class={inputClass} value={locationLabel()} readOnly disabled={m.disabled} />}
                  </ModalField>
                }
              >
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
              </Show>
              <Show
                when={isDraft()}
                fallback={
                  <ModalField settings={byKey} fieldKey="pic_name" fallbackLabel="PIC">
                    {(m) => <input class={inputClass} value={picName()} readOnly disabled={m.disabled} />}
                  </ModalField>
                }
              >
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
              </Show>
              <Show
                when={isDraft()}
                fallback={
                  <ModalField settings={byKey} fieldKey="project_id" fallbackLabel="Project">
                    {(m) => <input class={inputClass} value={projectLabel()} readOnly disabled={m.disabled} />}
                  </ModalField>
                }
              >
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
                    setProjectName("");
                  }}
                  fetchOptions={fetchProjects}
                />
              </Show>
              <ModalField settings={byKey} fieldKey="reference" fallbackLabel="Reference">
                {(m) => (
                  <input
                    class={inputClass}
                    value={reference()}
                    placeholder={m.placeholder}
                    readOnly={readOnly()}
                    disabled={m.disabled}
                    onInput={(e) => setReference(e.currentTarget.value)}
                  />
                )}
              </ModalField>
              <ModalField settings={byKey} fieldKey="notes" fallbackLabel="Notes">
                {(m) => (
                  <input
                    class={inputClass}
                    value={notes()}
                    placeholder={m.placeholder}
                    readOnly={readOnly()}
                    disabled={m.disabled}
                    onInput={(e) => setNotes(e.currentTarget.value)}
                  />
                )}
              </ModalField>
            </div>

            <Show
              when={isDraft()}
              fallback={
                <Show when={po()}>
                  {(d) => (
                    <div class="overflow-x-auto rounded-lg border border-stroke">
                      <table class="min-w-full text-sm">
                        <thead class="bg-slate-50 text-left text-xs uppercase text-text-secondary">
                          <tr>
                            <th class="px-2 py-2">#</th>
                            <th class="px-2 py-2">Item</th>
                            <th class="px-2 py-2 text-right">Qty</th>
                            <th class="px-2 py-2 text-right">Received</th>
                            <th class="px-2 py-2 text-right">Line total</th>
                          </tr>
                        </thead>
                        <tbody>
                          <For each={d().lines ?? []}>
                            {(ln) => (
                              <tr class="border-t border-stroke">
                                <td class="px-2 py-2">{ln.line_no}</td>
                                <td class="px-2 py-2">
                                  {ln.item_code} — {ln.item_name}
                                </td>
                                <td class="px-2 py-2 text-right">{ln.qty}</td>
                                <td class="px-2 py-2 text-right">{ln.received_qty ?? 0}</td>
                                <td class="px-2 py-2 text-right">
                                  {formatMoney(ln.line_total, d().currency_code ?? "")}
                                </td>
                              </tr>
                            )}
                          </For>
                        </tbody>
                      </table>
                    </div>
                  )}
                </Show>
              }
            >
              <div class="mb-2">
                <LoadSlipMenu
                  disabled={readOnly()}
                  options={filterLoadSlipOptions(PURCHASE_ORDER_LOAD_SLIP_OPTIONS, auth.me)}
                  onSelect={(id) => {
                    if (id === "pr") setPrPickerOpen(true);
                    if (id === "rfq") setSqPickerOpen(true);
                    if (id === "so") setSoPickerOpen(true);
                    if (id === "quotation") setQuotationPickerOpen(true);
                  }}
                />
              </div>
              <PurchaseRequestLineGrid
                lines={lines}
                onChange={setLines}
                taxTypeId={taxTypeId}
                taxTypeMeta={() => {
                  const t = selectedTaxType();
                  return t ? { tax_mode: t.tax_mode, rate_percent: t.rate_percent } : null;
                }}
                locationId={locationId}
                hidePartnerColumns
                lineViewKey={`${PURCHASE_REQUEST_ENTITY.purchaseOrder}.lines`}
              />
            </Show>
          </div>
      </Show>
      <AttachmentsField
        scope="purchase-order/purchase-orders"
        formOpen={props.open}
        docId={effectivePoId() ?? undefined}
        label={uiLabel("purchasing.attachments_po")}
        required={policyRequiresAttachment(processPolicy.data, "purchase_order")}
        onCountChange={setAttachmentCount}
      />
      <EmailHistoryPanel docType="purchase_order" docId={effectivePoId()} />
      <ChangeLogPanel targetType="po_purchase_order" targetId={effectivePoId()} />
      </LifecycleReadOnlyShell>
    </WideEntityModal>
    <HistoryLogModal open={historyOpen} onClose={() => setHistoryOpen(false)} targetType="po_purchase_order" targetId={effectivePoId()} title="History — Purchase Order" />
    <PurchaseRequestLinePickerModal
      open={prPickerOpen()}
      onClose={() => setPrPickerOpen(false)}
      onConfirm={(picked) => void applyPurchaseRequestLines(picked)}
    />
    <SupplierQuotationLinePickerModal
      open={sqPickerOpen()}
      onClose={() => setSqPickerOpen(false)}
      onConfirm={(picked) => void applySupplierQuotationLines(picked)}
    />
    <SalesSideOrderLinePickerModal
      open={soPickerOpen()}
      onClose={() => setSoPickerOpen(false)}
      onConfirm={(picked: PickedSalesOrderLine[]) =>
        void mapSellingOntoPurchaseOrder(
          picked.map((r) => ({
            item_id: r.item_id,
            item_code: r.item_code,
            item_name: r.item_name,
            balance_qty: r.balance_qty,
            unit_vat_inc: r.unit_vat_inc,
            track_serial: r.track_serial,
            location_id: r.location_id,
            location_name: r.location_name,
            tax_type_id: r.tax_type_id,
            currency_id: r.currency_id,
            pic_name: r.pic_name,
          })),
        )
      }
    />
    <QuotationLinePickerModal
      open={quotationPickerOpen()}
      onClose={() => setQuotationPickerOpen(false)}
      onConfirm={(picked: PickedQuotationLine[]) =>
        void mapSellingOntoPurchaseOrder(
          picked.map((r) => ({
            item_id: r.item_id,
            item_code: r.item_code,
            item_name: r.item_name,
            balance_qty: r.balance_qty > 0 ? r.balance_qty : r.qty,
            unit_vat_inc: r.unit_vat_inc,
            location_id: r.location_id,
            location_name: r.location_name,
            tax_type_id: r.tax_type_id,
            currency_id: r.currency_id,
            pic_name: r.pic_name,
          })),
        )
      }
    />
    <QuickCustomerModal
      open={showNewVendor()}
      partnerKind="vendor"
      initialName={newVendorName()}
      onClose={() => setShowNewVendor(false)}
      onCreated={(p) => {
        setPartnerId(p.id);
        setPartnerLabel(p.company_name);
        setPartnerCode("");
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
    </>
  );
}
