import { createEffect, createSignal, For, Show } from "solid-js";
import { formatPeso } from "../../../shared/money";
import { DecimalInput } from "../../../shared/DecimalInput";
import { apiFetch } from "../../../shared/api";
import { FINANCE_ENTITY } from "../../../shared/entityTypes";
import { requireFields, submitEntity } from "../../../shared/handleSaveResult";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";
import { DateInput } from "../../../shared/DateInput";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { useDocumentDraft } from "../../../shared/useDocumentDraft";
import { useToast } from "../../../shared/toast";
import { ModalField } from "../../../shared/ModalField";
import { buildRequiredChecks, useFormFieldSettings } from "../../../shared/useFormFieldSettings";
import type { OfficialReceiptDetail } from "../../../shared/useOfficialReceiptList";
import { WideEntityModal } from "../../../shared/WideEntityModal";
import { RecordHistoryButton } from "../../../shared/RecordHistoryButton";

export type { OfficialReceiptDetail };

type ApplicationRow = {
  sales_id: number | null;
  sales_label: string;
  grand_total: number;
  applied_amount: string;
};

type Props = {
  open: boolean;
  editing: OfficialReceiptDetail | null;
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

async function fetchCurrencies(): Promise<{ id: number; currency_code: string; is_default: boolean }[]> {
  const res = await apiFetch<{ id: number; currency_code: string; is_default: boolean }[]>(
    "/api/v1/quotation/currencies?page=1&pageSize=100&status=active&sort=name&order=asc",
  );
  return res.data ?? [];
}

async function fetchSalesForPartner(partnerId: number, q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "100", sort: "order_date", order: "desc" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; partner_id: number; sales_no: string; date_no_display: string; grand_total: number }[]>(
    `/api/v1/sales?${qs}`,
  );
  return (res.data ?? [])
    .filter((s) => s.partner_id === partnerId)
    .map((s) => ({
      id: s.id,
      label: `${s.date_no_display} — ${s.sales_no}`,
      sublabel: formatPeso(s.grand_total),
    }));
}

function emptyApplication(): ApplicationRow {
  return { sales_id: null, sales_label: "", grand_total: 0, applied_amount: "" };
}

function applicationsFromDetail(detail?: OfficialReceiptDetail | null): ApplicationRow[] {
  if (!detail?.applications?.length) return [emptyApplication()];
  return detail.applications.map((a) => ({
    sales_id: a.sales_id,
    sales_label: a.date_no_display && a.sales_no ? `${a.date_no_display} — ${a.sales_no}` : String(a.sales_id),
    grand_total: a.grand_total ?? 0,
    applied_amount: String(a.applied_amount),
  }));
}

export function OfficialReceiptModal(props: Props) {
  const toast = useToast();
  const { fields, byKey } = useFormFieldSettings(FINANCE_ENTITY.officialReceipt);
  const [saving, setSaving] = createSignal(false);
  const [receiptDate, setReceiptDate] = createSignal(todayISO());
  const [dateNoDisplay, setDateNoDisplay] = createSignal("");
  const [receiptNo, setReceiptNo] = createSignal("");
  const [currencies, setCurrencies] = createSignal<{ id: number; currency_code: string; is_default: boolean }[]>([]);
  const [currencyId, setCurrencyId] = createSignal<number | null>(null);
  const [partnerId, setPartnerId] = createSignal<number | null>(null);
  const [customerLabel, setCustomerLabel] = createSignal("");
  const [paymentMethod, setPaymentMethod] = createSignal("cash");
  const [referenceNo, setReferenceNo] = createSignal("");
  const [notes, setNotes] = createSignal("");
  const [applications, setApplications] = createSignal<ApplicationRow[]>([emptyApplication()]);

  const amountTotal = () =>
    applications().reduce((sum, row) => sum + (Number(row.applied_amount) || 0), 0);

  const buildDraftPayload = () => ({
    receipt_date: receiptDate(),
    currency_id: currencyId(),
    partner_id: partnerId(),
    customer_label: customerLabel(),
    payment_method: paymentMethod(),
    reference_no: referenceNo(),
    notes: notes(),
    applications: applications(),
  });

  const applyDraftPayload = (payload: ReturnType<typeof buildDraftPayload>) => {
    setReceiptDate(payload.receipt_date);
    setCurrencyId(payload.currency_id);
    setPartnerId(payload.partner_id);
    setCustomerLabel(payload.customer_label);
    setPaymentMethod(payload.payment_method);
    setReferenceNo(payload.reference_no);
    setNotes(payload.notes);
    setApplications(payload.applications?.length ? payload.applications : [emptyApplication()]);
  };

  const draft = useDocumentDraft({
    entityType: FINANCE_ENTITY.officialReceipt,
    draftKey: () => (props.editing ? `edit-${props.editing.id}` : "new"),
    getPayload: buildDraftPayload,
    onApply: applyDraftPayload,
    enabled: () => props.open,
    // No autoApply: loadLookups() below async-fetches currencies and picks a default currency
    // for the create flow, which can resolve after draft recovery and stomp currency_id.
  });

  const loadPreview = async (date: string) => {
    const res = await apiFetch<{ date_no_display: string; receipt_no: string }>(
      `/api/v1/finance/official-receipts/preview-sequences?receipt_date=${encodeURIComponent(date)}`,
    );
    if (res.success && res.data) {
      setDateNoDisplay(res.data.date_no_display);
      setReceiptNo(res.data.receipt_no);
    }
  };

  const loadLookups = async () => {
    const cc = await fetchCurrencies();
    setCurrencies(cc);
    if (!props.editing) {
      const def = cc.find((c) => c.is_default) ?? cc[0];
      if (def) setCurrencyId(def.id);
    }
  };

  const resetForm = () => {
    const ed = props.editing;
    if (ed) {
      setReceiptDate(ed.receipt_date);
      setDateNoDisplay(ed.date_no_display);
      setReceiptNo(ed.receipt_no);
      setPartnerId(ed.partner_id);
      setCustomerLabel(ed.customer_name);
      setCurrencyId(ed.currency_id);
      setPaymentMethod(ed.payment_method);
      setReferenceNo(ed.reference_no ?? "");
      setNotes(ed.notes ?? "");
      setApplications(applicationsFromDetail(ed));
    } else {
      setReceiptDate(todayISO());
      setPartnerId(null);
      setCustomerLabel("");
      setPaymentMethod("cash");
      setReferenceNo("");
      setNotes("");
      setApplications([emptyApplication()]);
      void loadPreview(todayISO());
    }
  };

  createEffect(() => {
    if (!props.open) return;
    void loadLookups();
    resetForm();
  });

  createEffect(() => {
    if (!props.open || props.editing) return;
    void loadPreview(receiptDate());
  });

  const patchApplication = (index: number, patch: Partial<ApplicationRow>) => {
    setApplications((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const addApplication = () => setApplications((rows) => [...rows, emptyApplication()]);

  const removeApplication = (index: number) => {
    setApplications((rows) => (rows.length <= 1 ? rows : rows.filter((_, i) => i !== index)));
  };

  const save = async () => {
    const formValues = {
      receipt_date: receiptDate(),
      partner_id: partnerId(),
      currency_id: currencyId(),
      payment_method: paymentMethod(),
      reference_no: referenceNo(),
      notes: notes(),
    };
    const clientError = requireFields(formValues as Record<string, unknown>, buildRequiredChecks(fields()));
    if (clientError) {
      toast.warning(clientError);
      return;
    }
    if (!partnerId()) return;

    const apps = applications()
      .filter((a) => a.sales_id && Number(a.applied_amount) > 0)
      .map((a) => ({
        sales_id: a.sales_id!,
        applied_amount: Number(a.applied_amount),
      }));
    if (apps.length === 0) {
      toast.warning("Add at least one sales application with an amount.");
      return;
    }

    setSaving(true);
    const body = {
      receipt_date: receiptDate(),
      partner_id: partnerId(),
      currency_id: currencyId(),
      payment_method: paymentMethod(),
      reference_no: referenceNo().trim() || null,
      notes: notes().trim() || null,
      applications: apps,
    };
    const ok = await submitEntity(
      () =>
        apiFetch(props.editing ? `/api/v1/finance/official-receipts/${props.editing.id}` : "/api/v1/finance/official-receipts", {
          method: props.editing ? "PATCH" : "POST",
          body: JSON.stringify(body),
        }, { silent: true }),
      toast,
      props.editing ? "Official receipt updated." : "Official receipt created.",
    );
    setSaving(false);
    if (ok) {
      await draft.clearOnSave();
      props.onSaved();
    }
  };

  return (
    <WideEntityModal
      open={props.open}
      title={props.editing ? "Edit Official Receipt" : "New Official Receipt"}
      onClose={() => props.onClose()}
      onSave={() => void save()}
      saving={saving()}
      headerActions={
        <RecordHistoryButton
          variant="button"
          targetType="fin_official_receipt"
          targetId={props.editing?.id}
          title={props.editing ? `History — ${props.editing.receipt_no}` : "History — Official Receipt"}
        />
      }
    >
      <draft.DraftBanner />
      <ModalField settings={byKey} fieldKey="receipt_date" fallbackLabel="Date" fallbackRequired>
          {(m) => (
            <DateInput
              value={receiptDate()}
              disabled={m.disabled}
              onInput={(e) => setReceiptDate(e.currentTarget.value)}
            />
          )}
        </ModalField>
        <Field label="Date-No.">
          <input class={inputClass} value={dateNoDisplay()} disabled />
        </Field>
        <Field label="Receipt No.">
          <input class={inputClass} value={receiptNo()} disabled />
        </Field>
        <ModalField settings={byKey} fieldKey="partner_id" fallbackLabel="Customer" fallbackRequired>
          {() => (
            <LookupCombo
              label=""
              value={customerLabel}
              selectedId={() => partnerId()}
              onInput={setCustomerLabel}
              onSelect={(o) => {
                setPartnerId(o.id);
                setCustomerLabel(o.label);
                setApplications([emptyApplication()]);
              }}
              onClear={() => {
                setPartnerId(null);
                setCustomerLabel("");
                setApplications([emptyApplication()]);
              }}
              fetchOptions={fetchPartners}
            />
          )}
        </ModalField>
        <ModalField settings={byKey} fieldKey="currency_id" fallbackLabel="Currency" fallbackRequired>
          {(m) => (
            <select
              class={inputClass}
              value={currencyId() ?? ""}
              disabled={m.disabled}
              onChange={(e) => setCurrencyId(Number(e.currentTarget.value) || null)}
            >
              <option value="">Select currency</option>
              <For each={currencies()}>{(c) => <option value={c.id}>{c.currency_code}</option>}</For>
            </select>
          )}
        </ModalField>
        <ModalField settings={byKey} fieldKey="payment_method" fallbackLabel="Payment method" fallbackRequired>
          {(m) => (
            <select
              class={inputClass}
              value={paymentMethod()}
              disabled={m.disabled}
              onChange={(e) => setPaymentMethod(e.currentTarget.value)}
            >
              <option value="cash">Cash</option>
              <option value="check">Check</option>
              <option value="bank_transfer">Bank Transfer</option>
            </select>
          )}
        </ModalField>
        <ModalField settings={byKey} fieldKey="reference_no" fallbackLabel="Reference no.">
          {(m) => (
            <input
              class={inputClass}
              value={referenceNo()}
              disabled={m.disabled}
              onInput={(e) => setReferenceNo(e.currentTarget.value)}
            />
          )}
        </ModalField>
        <ModalField settings={byKey} fieldKey="notes" fallbackLabel="Notes" span="full">
          {(m) => (
            <textarea
              class={inputClass}
              rows={2}
              value={notes()}
              disabled={m.disabled}
              onInput={(e) => setNotes(e.currentTarget.value)}
            />
          )}
        </ModalField>

      <div class="col-span-full mt-2">
        <div class="mb-2 flex items-center justify-between">
          <h3 class="text-sm font-semibold text-text-primary">Sales applications</h3>
          <button
            type="button"
            class="rounded border border-stroke px-3 py-1 text-sm text-brand-600 hover:bg-slate-50"
            disabled={!partnerId()}
            onClick={addApplication}
          >
            + Add row
          </button>
        </div>
        <div class="overflow-x-auto rounded border border-stroke">
          <table class="min-w-full text-sm">
            <thead class="bg-slate-50 text-xs uppercase text-text-secondary">
              <tr>
                <th class="px-3 py-2 text-left">Sales</th>
                <th class="px-3 py-2 text-right">Grand total</th>
                <th class="px-3 py-2 text-right">Applied amount</th>
                <th class="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              <For each={applications()}>
                {(row, index) => (
                  <tr class="border-t border-stroke/60">
                    <td class="px-3 py-2">
                      <Show
                        when={partnerId()}
                        fallback={<span class="text-text-secondary">Select customer first</span>}
                      >
                        <LookupCombo
                          label=""
                          value={() => applications()[index()]?.sales_label ?? ""}
                          selectedId={() => applications()[index()]?.sales_id ?? null}
                          onInput={(v) => patchApplication(index(), { sales_label: v })}
                          onSelect={async (o) => {
                            const res = await apiFetch<{ grand_total: number }>(`/api/v1/sales/${o.id}`);
                            patchApplication(index(), {
                              sales_id: o.id,
                              sales_label: o.label,
                              grand_total: res.data?.grand_total ?? 0,
                            });
                          }}
                          onClear={() =>
                            patchApplication(index(), { sales_id: null, sales_label: "", grand_total: 0, applied_amount: "" })
                          }
                          fetchOptions={(q) => fetchSalesForPartner(partnerId()!, q)}
                        />
                      </Show>
                    </td>
                    <td class="px-3 py-2 text-right">{formatPeso(row.grand_total)}</td>
                    <td class="px-3 py-2">
                      <DecimalInput
                        class={`${inputClass} text-right`}
                        value={row.applied_amount}
                        onValue={(v) => patchApplication(index(), { applied_amount: v })}
                      />
                    </td>
                    <td class="px-3 py-2 text-right">
                      <button type="button" class="text-sm text-red-600 hover:underline" onClick={() => removeApplication(index())}>
                        Remove
                      </button>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
            <tfoot>
              <tr class="border-t border-stroke bg-slate-50 font-semibold">
                <td class="px-3 py-2" colSpan={2}>
                  Total
                </td>
                <td class="px-3 py-2 text-right">{formatPeso(amountTotal())}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </WideEntityModal>
  );
}
