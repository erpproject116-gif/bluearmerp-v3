import { createEffect, createSignal, For, Show } from "solid-js";
import { useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../../shared/api";
import { invalidateRecordHistory } from "../../../shared/invalidateRecordHistory";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";
import { DateInput } from "../../../shared/DateInput";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { submitEntity } from "../../../shared/handleSaveResult";
import { useToast } from "../../../shared/toast";
import { WideEntityModal } from "../../../shared/WideEntityModal";
import { ChangeLogPanel } from "../../../shared/ChangeLogPanel";
import { AttachmentsField } from "../../../shared/AttachmentsField";
import { InvoicePanel } from "../../../shared/InvoicePanel";
import { HistoryLogModal } from "../../../shared/HistoryLogModal";
import { LoadSlipMenu, PURCHASE_LOAD_SLIP_OPTIONS } from "../../../shared/LoadSlipMenu";
import { defaultInputBasis, formatRateSummary, formatTaxTypeLabel } from "../../../shared/taxcalc";
import type { TaxTypeRow } from "../../../shared/useTaxTypeList";
import { ProgressStatusMenu } from "../../sales/sales/ProgressStatusMenu";
import type { OpenGRLine, OpenPOLine, SupplierInvoiceDetail } from "../../../shared/useSupplierInvoiceList";
import { OpenGRLinePickerModal } from "./OpenGRLinePickerModal";
import { OpenPOLinePickerModal } from "./OpenPOLinePickerModal";
import {
  PurchaseRequestLineGrid,
  emptyPurchaseRequestLine,
  recalculatePurchaseRequestLines,
  type PurchaseRequestLineRow,
} from "../../purchase-request/purchase-request/PurchaseRequestLineGrid";
import { SupplierInvoiceApprovalPanel } from "./SupplierInvoiceApprovalPanel";

export type { SupplierInvoiceDetail as PurchaseDetail };

type Props = {
  open: boolean;
  editing: SupplierInvoiceDetail | null;
  onClose: () => void;
  onSaved: () => void;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function fetchVendors(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; company_name: string; partner_kind: string }[]>(`/api/v1/inventory/partners?${qs}`);
  return (res.data ?? [])
    .filter((p) => p.partner_kind === "vendor" || p.partner_kind === "both")
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
    spec_name: "",
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
    goods_receipt_line_id: ln.goods_receipt_line_id ?? null,
    purchase_order_line_id: ln.purchase_order_line_id ?? null,
    track_serial: Boolean(ln.track_serial),
    planned_serial_nos: [],
  }));
}

export function SupplierInvoiceModal(props: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [saving, setSaving] = createSignal(false);
  const [grPickerOpen, setGrPickerOpen] = createSignal(false);
  const [poPickerOpen, setPoPickerOpen] = createSignal(false);
  const [historyOpen, setHistoryOpen] = createSignal(false);
  const [activeTab, setActiveTab] = createSignal<"details" | "invoice">("details");
  const [invoiceDate, setInvoiceDate] = createSignal(todayISO());
  const [dateNoDisplay, setDateNoDisplay] = createSignal("");
  const [invoiceNo, setInvoiceNo] = createSignal("");
  const [taxTypes, setTaxTypes] = createSignal<TaxTypeRow[]>([]);
  const [currencies, setCurrencies] = createSignal<{ id: number; currency_code: string; name: string; is_default: boolean }[]>([]);
  const [taxTypeId, setTaxTypeId] = createSignal<number | null>(null);
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
  const [termsOfPayment, setTermsOfPayment] = createSignal("");
  const [paymentTerms, setPaymentTerms] = createSignal("");
  const [vendorInvoiceNo, setVendorInvoiceNo] = createSignal("");
  const [reference, setReference] = createSignal("");
  const [notes, setNotes] = createSignal("");
  const [progressStatus, setProgressStatus] = createSignal("unconfirmed");
  const [lines, setLines] = createSignal<PurchaseRequestLineRow[]>([emptyPurchaseRequestLine(1)]);

  const selectedTaxType = () => taxTypes().find((t) => t.id === taxTypeId()) ?? null;

  const loadPreview = async (date: string) => {
    const res = await apiFetch<{ date_no_display: string; invoice_no: string }>(
      `/api/v1/finance/supplier-invoices/preview-sequences?invoice_date=${encodeURIComponent(date)}`,
    );
    if (res.success && res.data) {
      setDateNoDisplay(res.data.date_no_display);
      setInvoiceNo(res.data.invoice_no);
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
        setLines([emptyPurchaseRequestLine(1, "", basis)]);
      }
      const def = cc.find((c) => c.is_default) ?? cc[0];
      if (def && !currencyId()) setCurrencyId(def.id);
    }
  };

  createEffect(() => {
    if (!props.open) return;
    void loadLookups();
    const ed = props.editing;
    if (ed) {
      setInvoiceDate(ed.invoice_date);
      setDateNoDisplay(ed.date_no_display);
      setInvoiceNo(ed.invoice_no);
      setTaxTypeId(ed.tax_type_id ?? null);
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
      setTermsOfPayment(ed.terms_of_payment ?? "");
      setPaymentTerms(ed.payment_terms ?? "");
      setVendorInvoiceNo(ed.vendor_invoice_no ?? "");
      setReference(ed.reference ?? "");
      setNotes(ed.notes ?? "");
      setProgressStatus(ed.progress_status);
      setLines(linesFromDetail(ed.lines));
      setActiveTab("details");
    } else {
      setInvoiceDate(todayISO());
      setPartnerId(null);
      setVendorLabel("");
      setPicUserId(null);
      setPicName("");
      setLocationId(null);
      setLocationLabel("");
      setProjectId(null);
      setProjectLabel("");
      setProjectName("");
      setDueDate("");
      setTermsOfPayment("");
      setPaymentTerms("");
      setVendorInvoiceNo("");
      setReference("");
      setNotes("");
      setProgressStatus("unconfirmed");
      setLines([emptyPurchaseRequestLine(1)]);
      setActiveTab("details");
      void loadPreview(todayISO());
    }
  });

  createEffect(() => {
    if (!props.open || props.editing) return;
    void loadPreview(invoiceDate());
  });

  const onTaxTypeChange = async (newId: number | null) => {
    setTaxTypeId(newId);
    const meta = taxTypes().find((t) => t.id === newId);
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
      goods_receipt_line_id: row.goods_receipt_line_id,
    }));
    const merged = [...lines().filter((ln) => ln.item_id || ln.item_code), ...newLines].map((ln, i) => ({ ...ln, line_no: i + 1 }));
    if (meta && taxTypeId()) {
      setLines(await recalculatePurchaseRequestLines(merged.length ? merged : newLines, taxTypeId()!, meta));
    } else {
      setLines(merged.length ? merged : newLines);
    }
  };

  const applyPOLines = async (picked: OpenPOLine[]) => {
    if (picked.length === 0) return;
    const meta = taxTypes().find((t) => t.id === taxTypeId());
    const basis = meta ? defaultInputBasis(meta.tax_mode) : "vat_inc_unit";
    const start = lines().length;
    const newLines: PurchaseRequestLineRow[] = picked.map((row, i) => ({
      ...emptyPurchaseRequestLine(start + i + 1, String(row.unit_vat_inc), basis),
      item_id: row.item_id,
      item_code: row.item_code,
      item_name: row.item_name,
      qty: String(row.balance_qty),
      unit_price: String(row.unit_vat_inc),
      purchase_order_line_id: row.purchase_order_line_id,
      track_serial: row.track_serial,
    }));
    const merged = [...lines().filter((ln) => ln.item_id || ln.item_code), ...newLines].map((ln, i) => ({ ...ln, line_no: i + 1 }));
    if (meta && taxTypeId()) {
      setLines(await recalculatePurchaseRequestLines(merged.length ? merged : newLines, taxTypeId()!, meta));
    } else {
      setLines(merged.length ? merged : newLines);
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
      toast.warning("Please select a vendor.");
      return;
    }
    if (!locationId()) {
      toast.warning("Please select a location.");
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
      terms_of_payment: termsOfPayment() || null,
      payment_terms: paymentTerms() || null,
      vendor_invoice_no: vendorInvoiceNo() || null,
      reference: reference() || null,
      notes: notes() || null,
      progress_status: progressStatus(),
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
          unit_price: ln.unit_price === "" ? 0 : Number(ln.unit_price),
          input_basis: ln.input_basis,
          unit_non_vat: ln.unit_non_vat === "" ? 0 : Number(ln.unit_non_vat),
          non_vat_total: ln.non_vat_total === "" ? 0 : Number(ln.non_vat_total),
          tax_amount: ln.tax_amount === "" ? 0 : Number(ln.tax_amount),
          unit_vat_inc: ln.unit_vat_inc === "" ? 0 : Number(ln.unit_vat_inc),
          line_total: ln.line_total === "" ? 0 : Number(ln.line_total),
          remark: ln.remark || null,
        })),
    };

    if (body.lines.length === 0) {
      toast.warning("Add at least one line item.");
      return;
    }

    setSaving(true);
    const ed = props.editing;
    const ok = await submitEntity(
      () =>
        ed
          ? apiFetch(`/api/v1/finance/supplier-invoices/${ed.id}`, { method: "PATCH", body: JSON.stringify(body) }, { silent: true })
          : apiFetch("/api/v1/finance/supplier-invoices", { method: "POST", body: JSON.stringify(body) }, { silent: true }),
      toast,
      ed ? "Purchase updated." : "Purchase created.",
    );
    setSaving(false);
    if (!ok) return;
    if (ed) invalidateRecordHistory(queryClient, "fin_supplier_invoice", ed.id);
    props.onSaved();
    props.onClose();
  };

  return (
    <>
      <WideEntityModal
        open={props.open}
        title={props.editing ? "Edit Purchase (actual purchase)" : "New Purchase (actual purchase)"}
        onClose={props.onClose}
        onSave={activeTab() === "details" ? () => void save() : undefined}
        saving={saving()}
        tabs={props.editing ? [{ id: "details", label: "Details" }, { id: "invoice", label: "Invoice" }] : undefined}
        activeTab={activeTab()}
        onTabChange={(id) => setActiveTab(id as "details" | "invoice")}
        headerActions={
          <Show when={props.editing}>
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
            kind="purchase"
            docId={props.editing?.id}
            attachmentsScope="finance/supplier-invoices"
            onPrint={() =>
              props.editing &&
              window.open(`/app/purchases/purchases/${props.editing.id}/print`, "_blank", "noopener,noreferrer")
            }
          />
        </Show>
        <Show when={activeTab() === "details"}>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Date-no">
              <input class={inputClass} value={dateNoDisplay()} readOnly />
            </Field>
            <Field label="Purchase No.">
              <input class={inputClass} value={invoiceNo()} readOnly />
            </Field>
            <Field label="Date *">
              <DateInput value={invoiceDate()} onInput={(e) => setInvoiceDate(e.currentTarget.value)} />
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
                  {(t) => <option value={t.id}>{formatTaxTypeLabel(t.name, t.tax_mode, t.rate_percent)}</option>}
                </For>
              </select>
              <Show when={selectedTaxType()}>
                {(t) => <p class="mt-1 text-xs text-text-secondary">{formatRateSummary(t().tax_mode, t().rate_percent)}</p>}
              </Show>
            </Field>
            <Field label="Currency *">
              <select class={inputClass} value={currencyId() ?? ""} onChange={(e) => setCurrencyId(Number(e.currentTarget.value) || null)}>
                <option value="">Select…</option>
                <For each={currencies()}>{(c) => <option value={c.id}>{c.currency_code} — {c.name}</option>}</For>
              </select>
            </Field>
            <LookupCombo
              label="Vendor *"
              required
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
              fetchOptions={fetchVendors}
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
              <input class={inputClass} value={vendorInvoiceNo()} onInput={(e) => setVendorInvoiceNo(e.currentTarget.value)} />
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
            <Field label="PO Number">
              <input class={inputClass} value={reference()} onInput={(e) => setReference(e.currentTarget.value)} />
            </Field>
            <AttachmentsField
              scope="finance/supplier-invoices"
              docId={props.editing?.id}
              label="Attachments (carried from Purchase Order/Receiving)"
              emptyUnsavedHint="Save the purchase first to attach files (max 25 MB each)."
            />
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
          <div class="col-span-full mb-2 mt-2">
            <LoadSlipMenu
              disabled={!partnerId()}
              options={PURCHASE_LOAD_SLIP_OPTIONS}
              onSelect={(id) => {
                if (id === "po") setPoPickerOpen(true);
                if (id === "gr") setGrPickerOpen(true);
              }}
            />
          </div>
          <PurchaseRequestLineGrid
            lines={lines}
            onChange={setLines}
            taxTypeId={() => taxTypeId()}
            taxTypeMeta={selectedTaxType}
            locationId={() => locationId()}
            hidePartnerColumns
          />
          <Show when={props.editing}>
            <SupplierInvoiceApprovalPanel
              supplierInvoiceId={props.editing!.id}
              progressStatus={progressStatus()}
              onChanged={() => {
                void apiFetch<SupplierInvoiceDetail>(`/api/v1/finance/supplier-invoices/${props.editing!.id}`).then((res) => {
                  if (res.success && res.data) setProgressStatus(res.data.progress_status);
                });
              }}
            />
            <ChangeLogPanel targetType="fin_supplier_invoice" targetId={props.editing!.id} />
          </Show>
        </Show>
      </WideEntityModal>

      <OpenGRLinePickerModal
        open={grPickerOpen()}
        partnerId={partnerId()}
        onClose={() => setGrPickerOpen(false)}
        onConfirm={(picked) => void applyGRLines(picked)}
      />

      <OpenPOLinePickerModal
        open={poPickerOpen()}
        partnerId={partnerId()}
        onClose={() => setPoPickerOpen(false)}
        onConfirm={(picked) => void applyPOLines(picked)}
      />

      <HistoryLogModal
        open={historyOpen()}
        onClose={() => setHistoryOpen(false)}
        targetType="fin_supplier_invoice"
        targetId={props.editing?.id}
        title="History — Purchase"
      />
    </>
  );
}
