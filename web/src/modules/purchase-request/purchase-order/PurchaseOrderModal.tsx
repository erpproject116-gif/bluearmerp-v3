import { createEffect, createSignal, For, Show } from "solid-js";
import { useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../../shared/api";
import { getActiveBranchCurrent } from "../../../shared/activeContext";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";
import { DateInput } from "../../../shared/DateInput";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { handleSaveResult } from "../../../shared/handleSaveResult";
import { useToast } from "../../../shared/toast";
import { formatRateSummary, formatTaxTypeLabel, defaultInputBasis } from "../../../shared/taxcalc";
import {
  ACTIVE_CURRENCIES_KEY,
  ACTIVE_TAX_TYPES_KEY,
  loadActiveCurrencies,
  loadActiveTaxTypes,
  useActiveCurrencies,
  useActiveTaxTypes,
} from "../../../shared/useDocumentLookups";
import { WideEntityModal } from "../../../shared/WideEntityModal";
import { ChangeLogPanel } from "../../../shared/ChangeLogPanel";
import { HistoryLogModal } from "../../../shared/HistoryLogModal";
import { AttachmentsField } from "../../../shared/AttachmentsField";
import { useProcessPolicy, policyRequiresAttachment } from "../../../shared/useProcessPolicy";
import { TermHint } from "../../../shared/TermHint";
import { LoadSlipMenu, PURCHASE_ORDER_LOAD_SLIP_OPTIONS } from "../../../shared/LoadSlipMenu";
import { DocumentEmailToolbar } from "../../comms/DocumentEmailToolbar";
import {
  PurchaseRequestLineGrid,
  emptyPurchaseRequestLine,
  recalculatePurchaseRequestLines,
  type PurchaseRequestLineRow,
} from "../purchase-request/PurchaseRequestLineGrid";
import { PurchaseRequestLinePickerModal, type PickedPurchaseRequestLine } from "./PurchaseRequestLinePickerModal";
import {
  SupplierQuotationLinePickerModal,
  type PickedSupplierQuotationLine,
} from "./SupplierQuotationLinePickerModal";
import { formatMoney } from "../purchase-request/purchaseRequestPrint";

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
    unit_non_vat: number;
    non_vat_total: number;
    tax_amount: number;
    unit_vat_inc: number;
    line_total: number;
    remark?: string | null;
    purchase_request_line_id?: number | null;
    planned_serial_nos?: string[];
    track_serial?: boolean;
  }>;
};

type Props = {
  open: boolean;
  purchaseOrderId: number | null;
  onClose: () => void;
  onSaved: () => void;
};

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

async function fetchPartners(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; company_name: string; partner_code: string; partner_kind: string }[]>(
    `/api/v1/inventory/partners?${qs}`,
  );
  return (res.data ?? [])
    .filter((p) => p.partner_kind === "vendor" || p.partner_kind === "both")
    .map((p) => ({
      id: p.id,
      label: p.company_name,
      sublabel: p.partner_code,
    }));
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
  const toast = useToast();
  const processPolicy = useProcessPolicy(() => props.open);
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
  const [detail, setDetail] = createSignal<PurchaseOrderDetail | null>(null);
  const [savedPoId, setSavedPoId] = createSignal<number | null>(null);
  const effectivePoId = () => props.purchaseOrderId ?? savedPoId();

  const [orderDate, setOrderDate] = createSignal("");
  const [taxTypeId, setTaxTypeId] = createSignal<number | null>(null);
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
  const readOnly = () => !isDraft();
  const selectedTaxType = () => taxTypes().find((t) => t.id === taxTypeId()) ?? null;

  const applyDetail = (po: PurchaseOrderDetail) => {
    setDetail(po);
    setOrderDate(po.order_date);
    setTaxTypeId(po.tax_type_id);
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
      apiFetch<PurchaseOrderDetail>(`/api/v1/purchase-order/purchase-orders/${id}`),
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
    setPartnerId(null);
    setPartnerLabel("");
    setPartnerCode("");
    if (tt.length) {
      const first = tt[0];
      setTaxTypeId(first.id);
      setLines([emptyPurchaseRequestLine(1, "", defaultInputBasis(first.tax_mode))]);
    } else {
      setTaxTypeId(null);
      setLines([emptyPurchaseRequestLine(1)]);
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

  const onTaxTypeChange = async (newId: number | null) => {
    if (readOnly()) return;
    setTaxTypeId(newId);
    const meta = taxTypes().find((t) => t.id === newId);
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
    const basis = meta ? defaultInputBasis(meta.tax_mode) : "vat_inc_unit";
    const newLines: PurchaseRequestLineRow[] = picked.map((row, i) => ({
      ...emptyPurchaseRequestLine(i + 1, String(row.unit_price), basis),
      item_id: row.item_id ?? null,
      item_code: row.item_code,
      item_name: row.item_name,
      spec_name: row.spec_name ?? "",
      description: row.description ?? "",
      qty: String(row.balance_qty),
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
    const basis = meta ? defaultInputBasis(meta.tax_mode) : "vat_inc_unit";
    const newLines: PurchaseRequestLineRow[] = picked.map((row, i) => ({
      ...emptyPurchaseRequestLine(i + 1, String(row.unit_price), basis),
      item_id: row.item_id ?? null,
      item_code: row.item_code,
      item_name: row.item_name,
      qty: String(row.balance_qty),
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
    applyDetail(res.data);
    props.onSaved();
    if (props.purchaseOrderId) {
      props.onClose();
      return;
    }
    if (!savedPoId()) {
      setSavedPoId(res.data.id);
    }
  };

  const po = () => detail();

  return (
    <>
    <WideEntityModal
      open={props.open}
      title={isCreate() ? "New Purchase Order" : po() ? `Purchase Order — ${po()!.purchase_order_no}` : "Purchase Order"}
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
          />
          <button type="button" class="rounded-lg border border-stroke px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-slate-50" onClick={() => setHistoryOpen(true)}>
            History
          </button>
        </Show>
      }
    >
      <Show when={loading()}>
        <p class="text-sm text-text-secondary">Loading…</p>
      </Show>
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
              <Field label="Order date">
                <DateInput
                  value={orderDate()}
                  onInput={(e) => setOrderDate(e.currentTarget.value)}
                  disabled={readOnly()}
                />
              </Field>
              <Field label={<TermHint term="tax_treatment" />}>
                <select
                  class={inputClass}
                  value={taxTypeId() ?? ""}
                  disabled={readOnly()}
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
              <Field label="Currency">
                <select
                  class={inputClass}
                  value={currencyId() ?? ""}
                  disabled={readOnly()}
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
              </Field>
              <Field label="Vendor *">
                <Show
                  when={isDraft()}
                  fallback={<input class={inputClass} value={partnerLabel()} readOnly />}
                >
                  <LookupCombo
                    label=""
                    required
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
                    fetchOptions={fetchPartners}
                  />
                </Show>
              </Field>
              <Field label="Location">
                <Show
                  when={isDraft()}
                  fallback={<input class={inputClass} value={locationLabel()} readOnly />}
                >
                  <LookupCombo
                    label=""
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
                </Show>
              </Field>
              <Field label="PIC">
                <Show when={isDraft()} fallback={<input class={inputClass} value={picName()} readOnly />}>
                  <LookupCombo
                    label=""
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
              </Field>
              <Field label="Project">
                <Show when={isDraft()} fallback={<input class={inputClass} value={projectLabel()} readOnly />}>
                  <LookupCombo
                    label=""
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
              </Field>
              <Field label="Reference">
                <input
                  class={inputClass}
                  value={reference()}
                  readOnly={readOnly()}
                  onInput={(e) => setReference(e.currentTarget.value)}
                />
              </Field>
              <Field label="Notes">
                <input
                  class={inputClass}
                  value={notes()}
                  readOnly={readOnly()}
                  onInput={(e) => setNotes(e.currentTarget.value)}
                />
              </Field>
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
                  options={PURCHASE_ORDER_LOAD_SLIP_OPTIONS}
                  onSelect={(id) => {
                    if (id === "pr") setPrPickerOpen(true);
                    if (id === "rfq") setSqPickerOpen(true);
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
              />
            </Show>
          </div>
      </Show>
      <AttachmentsField
        scope="purchase-order/purchase-orders"
        docId={effectivePoId() ?? undefined}
        label="Attachments (carried to Purchases)"
        required={policyRequiresAttachment(processPolicy.data, "purchase_order")}
        onCountChange={setAttachmentCount}
        emptyUnsavedHint="Save the purchase order first to attach files (max 25 MB each). Confirm on the list only after uploading."
      />
      <ChangeLogPanel targetType="po_purchase_order" targetId={effectivePoId()} />
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
    </>
  );
}
