import { createEffect, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";
import { DateInput } from "../../../shared/DateInput";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { PURCHASE_REQUEST_ENTITY } from "../../../shared/entityTypes";
import { requireFields, submitEntity } from "../../../shared/handleSaveResult";
import { useDocumentDraft } from "../../../shared/useDocumentDraft";
import { useToast } from "../../../shared/toast";
import { buildRequiredChecks, useFormFieldSettings } from "../../../shared/useFormFieldSettings";
import { WideEntityModal } from "../../../shared/WideEntityModal";
import { defaultInputBasis, formatRateSummary, formatTaxTypeLabel } from "../../../shared/taxcalc";
import type { TaxTypeRow } from "../../../shared/useTaxTypeList";
import { ProgressStatusMenu } from "./ProgressStatusMenu";
import {
  PurchaseRequestLineGrid,
  emptyPurchaseRequestLine,
  recalculatePurchaseRequestLines,
  type PurchaseRequestLineRow,
} from "./PurchaseRequestLineGrid";

export type PurchaseRequestDetail = {
  id: number;
  request_date: string;
  date_seq: number;
  date_no_display: string;
  purchase_request_no: string;
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
  cc?: string | null;
  domestic_foreign: string;
  send_status: string;
  progress_status: string;
  total_qty: number;
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
    unit_non_vat: number;
    non_vat_total: number;
    tax_amount: number;
    unit_vat_inc: number;
    line_total: number;
    remark?: string | null;
  }>;
};

type Props = {
  open: boolean;
  editing: PurchaseRequestDetail | null;
  onClose: () => void;
  onSaved: () => void;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateNoDisplay(iso: string, seq: number) {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return String(seq);
  return `${m}/${d}/${y}-${seq}`;
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

function linesFromDetail(lines?: PurchaseRequestDetail["lines"]): PurchaseRequestLineRow[] {
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
  }));
}

export function PurchaseRequestModal(props: Props) {
  const toast = useToast();
  const { fields } = useFormFieldSettings(PURCHASE_REQUEST_ENTITY.purchaseRequest);
  const [saving, setSaving] = createSignal(false);
  const [requestDate, setRequestDate] = createSignal(todayISO());
  const [dateSeq, setDateSeq] = createSignal(1);
  const [dateNoDisplay, setDateNoDisplay] = createSignal("");
  const [purchaseRequestNo, setPurchaseRequestNo] = createSignal("");
  const [taxTypes, setTaxTypes] = createSignal<TaxTypeRow[]>([]);
  const [currencies, setCurrencies] = createSignal<{ id: number; currency_code: string; name: string; is_default: boolean }[]>([]);
  const [taxTypeId, setTaxTypeId] = createSignal<number | null>(null);
  const [currencyId, setCurrencyId] = createSignal<number | null>(null);
  const [picUserId, setPicUserId] = createSignal<number | null>(null);
  const [picName, setPicName] = createSignal("");
  const [locationId, setLocationId] = createSignal<number | null>(null);
  const [locationLabel, setLocationLabel] = createSignal("");
  const [projectId, setProjectId] = createSignal<number | null>(null);
  const [projectLabel, setProjectLabel] = createSignal("");
  const [projectName, setProjectName] = createSignal("");
  const [cc, setCc] = createSignal("");
  const [domesticForeign, setDomesticForeign] = createSignal<"domestic" | "foreign">("domestic");
  const [sendStatus, setSendStatus] = createSignal<"unsent" | "sent">("unsent");
  const [reference, setReference] = createSignal("");
  const [notes, setNotes] = createSignal("");
  const [progressStatus, setProgressStatus] = createSignal("unconfirmed");
  const [lines, setLines] = createSignal<PurchaseRequestLineRow[]>([emptyPurchaseRequestLine(1)]);

  const selectedTaxType = () => taxTypes().find((t) => t.id === taxTypeId()) ?? null;

  const buildDraftPayload = () => ({
    request_date: requestDate(),
    date_seq: dateSeq(),
    tax_type_id: taxTypeId(),
    currency_id: currencyId(),
    pic_user_id: picUserId(),
    pic_name: picName(),
    location_id: locationId(),
    location_label: locationLabel(),
    project_id: projectId(),
    project_label: projectLabel(),
    project_name: projectName(),
    cc: cc(),
    domestic_foreign: domesticForeign(),
    send_status: sendStatus(),
    reference: reference(),
    notes: notes(),
    progress_status: progressStatus(),
    lines: lines(),
  });

  const applyDraftPayload = (payload: ReturnType<typeof buildDraftPayload>) => {
    setRequestDate(payload.request_date);
    setDateSeq(payload.date_seq);
    setTaxTypeId(payload.tax_type_id);
    setCurrencyId(payload.currency_id);
    setPicUserId(payload.pic_user_id);
    setPicName(payload.pic_name);
    setLocationId(payload.location_id);
    setLocationLabel(payload.location_label);
    setProjectId(payload.project_id);
    setProjectLabel(payload.project_label);
    setProjectName(payload.project_name);
    setCc(payload.cc);
    setDomesticForeign(payload.domestic_foreign);
    setSendStatus(payload.send_status);
    setReference(payload.reference);
    setNotes(payload.notes);
    setProgressStatus(payload.progress_status);
    setLines(payload.lines);
    setDateNoDisplay(formatDateNoDisplay(payload.request_date, payload.date_seq));
  };

  const draft = useDocumentDraft({
    entityType: PURCHASE_REQUEST_ENTITY.purchaseRequest,
    draftKey: props.editing ? `edit-${props.editing.id}` : "new",
    getPayload: buildDraftPayload,
    onApply: applyDraftPayload,
    enabled: () => props.open && !props.editing,
  });

  const onTaxTypeChange = async (newId: number | null) => {
    setTaxTypeId(newId);
    const meta = taxTypes().find((t) => t.id === newId);
    if (!newId || !meta) return;
    const recalc = await recalculatePurchaseRequestLines(lines(), newId, meta);
    setLines(recalc);
  };

  const loadPreview = async (date: string, seq?: number) => {
    const res = await apiFetch<{ date_seq: number; purchase_request_no: string }>(
      `/api/v1/purchase-request/purchase-requests/preview-sequences?request_date=${encodeURIComponent(date)}`,
    );
    if (res.success && res.data) {
      const nextSeq = seq ?? res.data.date_seq;
      setDateSeq(nextSeq);
      setDateNoDisplay(formatDateNoDisplay(date, nextSeq));
      setPurchaseRequestNo(res.data.purchase_request_no);
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
      setRequestDate(ed.request_date);
      setDateSeq(ed.date_seq);
      setDateNoDisplay(ed.date_no_display);
      setPurchaseRequestNo(ed.purchase_request_no);
      setTaxTypeId(ed.tax_type_id);
      setCurrencyId(ed.currency_id);
      setPicUserId(ed.pic_user_id ?? null);
      setPicName(ed.pic_name);
      setLocationId(ed.location_id);
      setLocationLabel(ed.location_name ?? "");
      setProjectId(ed.project_id ?? null);
      setProjectLabel(ed.project_name ?? "");
      setProjectName(ed.project_name ?? "");
      setCc(ed.cc ?? "");
      setDomesticForeign(ed.domestic_foreign === "foreign" ? "foreign" : "domestic");
      setSendStatus(ed.send_status === "sent" ? "sent" : "unsent");
      setReference(ed.reference ?? "");
      setNotes(ed.notes ?? "");
      setProgressStatus(ed.progress_status);
      setLines(linesFromDetail(ed.lines));
    } else {
      setRequestDate(todayISO());
      setPicUserId(null);
      setPicName("");
      setLocationId(null);
      setLocationLabel("");
      setProjectId(null);
      setProjectLabel("");
      setProjectName("");
      setCc("");
      setDomesticForeign("domestic");
      setSendStatus("unsent");
      setReference("");
      setNotes("");
      setProgressStatus("unconfirmed");
      setLines([emptyPurchaseRequestLine(1)]);
      void loadPreview(todayISO());
    }
  });

  createEffect(() => {
    if (props.open && !props.editing) void loadPreview(requestDate());
  });

  const onDateSeqChange = (seq: number) => {
    setDateSeq(seq);
    setDateNoDisplay(formatDateNoDisplay(requestDate(), seq));
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
    if (!locationId()) {
      toast.warning("Please select a location.");
      return;
    }
    const formValues = {
      request_date: requestDate(),
      location_id: locationId(),
      progress_status: progressStatus(),
    };
    const clientError = requireFields(formValues as Record<string, unknown>, buildRequiredChecks(fields()));
    if (clientError) {
      toast.warning(clientError);
      return;
    }

    const body: Record<string, unknown> = {
      request_date: requestDate(),
      tax_type_id: taxTypeId(),
      currency_id: currencyId(),
      pic_user_id: picUserId(),
      pic_name: picName(),
      location_id: locationId(),
      project_id: projectId(),
      project_name: projectName() || null,
      cc: cc() || null,
      domestic_foreign: domesticForeign(),
      send_status: sendStatus(),
      reference: reference() || null,
      notes: notes() || null,
      progress_status: progressStatus(),
      lines: lines().map((ln, i) => ({
        line_no: i + 1,
        partner_id: ln.partner_id || null,
        partner_code: ln.partner_code,
        partner_name: ln.partner_name,
        item_id: ln.item_id || null,
        item_code: ln.item_code,
        item_name: ln.item_name,
        spec_name: ln.spec_name || null,
        description: ln.description || null,
        qty: ln.qty === "" ? 0 : Number(ln.qty),
        unit_price: ln.unit_price === "" ? 0 : Number(ln.unit_price),
        input_basis: ln.input_basis,
        remark: ln.remark || null,
      })),
    };
    if (!props.editing) {
      body.date_seq = dateSeq();
    }

    setSaving(true);
    const ed = props.editing;
    const ok = await submitEntity(
      () =>
        ed
          ? apiFetch(`/api/v1/purchase-request/purchase-requests/${ed.id}`, { method: "PATCH", body: JSON.stringify(body) }, { silent: true })
          : apiFetch("/api/v1/purchase-request/purchase-requests", { method: "POST", body: JSON.stringify(body) }, { silent: true }),
      toast,
      ed ? "Purchase request updated." : "Purchase request created.",
    );
    setSaving(false);
    if (!ok) return;
    await draft.clearOnSave();
    props.onSaved();
    props.onClose();
  };

  return (
    <WideEntityModal
      open={props.open}
      title={props.editing ? "Edit Purchase Request" : "New Purchase Request"}
      onClose={() => props.onClose()}
      onSave={() => void save()}
      saving={saving()}
    >
      <draft.DraftBanner />
      <Field label="Date-no">
        <input class={inputClass} value={dateNoDisplay()} readOnly />
      </Field>
      <Field label="Purchase Request No.">
        <input class={inputClass} value={purchaseRequestNo()} readOnly />
      </Field>
      <Field label="Request date *">
        <DateInput value={requestDate()} onInput={(e) => setRequestDate(e.currentTarget.value)} />
      </Field>
      <Show when={!props.editing}>
        <Field label="Date seq">
          <input
            type="number"
            class={inputClass}
            min={1}
            value={dateSeq()}
            onInput={(e) => onDateSeqChange(Math.max(1, Number(e.currentTarget.value) || 1))}
          />
        </Field>
      </Show>
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
      <Field label="Cc">
        <input class={inputClass} value={cc()} onInput={(e) => setCc(e.currentTarget.value)} />
      </Field>
      <Field label="Domestic / Foreign">
        <div class="flex gap-4 text-sm">
          <label class="flex items-center gap-1.5">
            <input type="radio" name="domestic_foreign" checked={domesticForeign() === "domestic"} onChange={() => setDomesticForeign("domestic")} />
            Domestic
          </label>
          <label class="flex items-center gap-1.5">
            <input type="radio" name="domestic_foreign" checked={domesticForeign() === "foreign"} onChange={() => setDomesticForeign("foreign")} />
            Foreign
          </label>
        </div>
      </Field>
      <Field label="Send status">
        <select class={inputClass} value={sendStatus()} onChange={(e) => setSendStatus(e.currentTarget.value as "unsent" | "sent")}>
          <option value="unsent">Unsent</option>
          <option value="sent">Sent</option>
        </select>
      </Field>
      <Field label="Progress status">
        <ProgressStatusMenu value={progressStatus()} onChange={setProgressStatus} />
      </Field>
      <Field label="Reference">
        <input class={inputClass} value={reference()} onInput={(e) => setReference(e.currentTarget.value)} />
      </Field>
      <Field label="Notes" span="full">
        <textarea class={inputClass} rows={2} value={notes()} onInput={(e) => setNotes(e.currentTarget.value)} />
      </Field>
      <Show when={props.editing}>
        <Field label="Created by">
          <input class={inputClass} value={props.editing?.created_by_name ?? ""} readOnly />
        </Field>
      </Show>
      <PurchaseRequestLineGrid
        lines={lines}
        onChange={setLines}
        taxTypeId={taxTypeId}
        taxTypeMeta={() => {
          const t = selectedTaxType();
          return t ? { tax_mode: t.tax_mode, rate_percent: t.rate_percent } : null;
        }}
        locationId={locationId}
      />
    </WideEntityModal>
  );
}
