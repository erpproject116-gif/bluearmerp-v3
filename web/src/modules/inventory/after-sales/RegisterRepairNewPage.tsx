import { createEffect, createSignal, Show } from "solid-js";
import { useNavigate, useSearchParams } from "@solidjs/router";
import { apiFetch } from "../../../shared/api";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";
import { DateInput } from "../../../shared/DateInput";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { ItemSearchModal, type ItemSearchRow } from "../../../shared/ItemSearchModal";
import { submitEntity } from "../../../shared/handleSaveResult";
import { useToast } from "../../../shared/toast";
import { AfterSalesLayout } from "./AfterSalesLayout";

async function fetchPartners(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; company_name: string; partner_kind: string }[]>(`/api/v1/inventory/partners?${qs}`);
  return (res.data ?? [])
    .filter((p) => p.partner_kind === "customer" || p.partner_kind === "both")
    .map((p) => ({ id: p.id, label: p.company_name }));
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function RegisterRepairNewPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const toast = useToast();
  const editId = () => {
    const raw = params.id;
    const id = typeof raw === "string" ? parseInt(raw, 10) : NaN;
    return Number.isFinite(id) ? id : null;
  };

  const [saving, setSaving] = createSignal(false);
  const [registrationDate, setRegistrationDate] = createSignal(todayISO());
  const [dateNoDisplay, setDateNoDisplay] = createSignal("");
  const [registrationNo, setRegistrationNo] = createSignal("");
  const [partnerId, setPartnerId] = createSignal<number | null>(null);
  const [partnerLabel, setPartnerLabel] = createSignal("");
  const [itemId, setItemId] = createSignal<number | null>(null);
  const [itemCode, setItemCode] = createSignal("");
  const [itemName, setItemName] = createSignal("");
  const [serialNo, setSerialNo] = createSignal("");
  const [issueDescription, setIssueDescription] = createSignal("");
  const [status, setStatus] = createSignal("open");
  const [itemPickerOpen, setItemPickerOpen] = createSignal(false);
  const [readOnly, setReadOnly] = createSignal(false);

  const loadPreview = async (date: string) => {
    const res = await apiFetch<{ date_no_display: string; registration_no: string }>(
      `/api/v1/inventory/repair-registrations/preview-sequences?registration_date=${encodeURIComponent(date)}`,
    );
    if (res.success && res.data) {
      setDateNoDisplay(res.data.date_no_display);
      setRegistrationNo(res.data.registration_no);
    }
  };

  createEffect(() => {
    const id = editId();
    if (id) {
      void (async () => {
        const res = await apiFetch<{
          registration_date: string;
          date_no_display: string;
          registration_no: string;
          partner_id: number;
          partner_name?: string;
          item_id?: number | null;
          item_code: string;
          item_name: string;
          serial_no?: string | null;
          issue_description?: string | null;
          status: string;
        }>(`/api/v1/inventory/repair-registrations/${id}`);
        if (!res.success || !res.data) return;
        const d = res.data;
        setRegistrationDate(d.registration_date);
        setDateNoDisplay(d.date_no_display);
        setRegistrationNo(d.registration_no);
        setPartnerId(d.partner_id);
        setPartnerLabel(d.partner_name ?? "");
        setItemId(d.item_id ?? null);
        setItemCode(d.item_code);
        setItemName(d.item_name);
        setSerialNo(d.serial_no ?? "");
        setIssueDescription(d.issue_description ?? "");
        setStatus(d.status);
        setReadOnly(d.status === "converted");
      })();
    } else {
      void loadPreview(registrationDate());
    }
  });

  createEffect(() => {
    if (!editId()) void loadPreview(registrationDate());
  });

  const onItemPicked = (row: ItemSearchRow) => {
    setItemId(row.id);
    setItemCode(row.item_code);
    setItemName(row.item_name);
    setItemPickerOpen(false);
  };

  const save = async () => {
    if (!partnerId()) {
      toast.warning("Please select a customer.");
      return;
    }
    const body = {
      registration_date: registrationDate(),
      partner_id: partnerId(),
      item_id: itemId(),
      item_code: itemCode(),
      item_name: itemName(),
      serial_no: serialNo() || null,
      issue_description: issueDescription() || null,
      status: status(),
    };
    setSaving(true);
    const id = editId();
    const ok = await submitEntity(
      () =>
        id
          ? apiFetch(`/api/v1/inventory/repair-registrations/${id}`, { method: "PATCH", body: JSON.stringify(body) }, { silent: true })
          : apiFetch("/api/v1/inventory/repair-registrations", { method: "POST", body: JSON.stringify(body) }, { silent: true }),
      toast,
      id ? "Registration updated." : "Registration created.",
    );
    setSaving(false);
    if (!ok) return;
    navigate("/app/after-sales/register-repair");
  };

  return (
    <AfterSalesLayout>
      <div class="mx-auto max-w-3xl space-y-4 rounded-xl border border-stroke bg-white p-6 shadow-sm">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-text-primary">{editId() ? "Edit Registration" : "New Registration"}</h2>
          <button type="button" class="text-sm text-text-secondary hover:text-text-primary" onClick={() => navigate("/app/after-sales/register-repair")}>
            ← Back to list
          </button>
        </div>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Date-no">
            <input class={inputClass} value={dateNoDisplay()} readOnly />
          </Field>
          <Field label="Registration No.">
            <input class={inputClass} value={registrationNo()} readOnly />
          </Field>
          <Field label="Date *">
            <DateInput
              value={registrationDate()}
              disabled={readOnly()}
              onInput={(e) => setRegistrationDate(e.currentTarget.value)}
            />
          </Field>
          <LookupCombo
            label="Customer *"
            value={partnerLabel}
            selectedId={partnerId}
            onInput={setPartnerLabel}
            onSelect={(o) => {
              setPartnerId(o.id);
              setPartnerLabel(o.label);
            }}
            onClear={() => {
              setPartnerId(null);
              setPartnerLabel("");
            }}
            fetchOptions={fetchPartners}
          />
          <Field label="Item code">
            <div class="flex gap-2">
              <input class={inputClass} value={itemCode()} readOnly />
              <button
                type="button"
                class="shrink-0 rounded border border-stroke px-3 text-sm hover:bg-slate-50 disabled:opacity-50"
                disabled={readOnly()}
                onClick={() => setItemPickerOpen(true)}
              >
                Search
              </button>
            </div>
          </Field>
          <Field label="Item name">
            <input class={inputClass} value={itemName()} readOnly />
          </Field>
          <Field label="Serial no.">
            <input class={inputClass} value={serialNo()} disabled={readOnly()} onInput={(e) => setSerialNo(e.currentTarget.value)} />
          </Field>
          <Field label="Status">
            <select class={inputClass} value={status()} disabled={readOnly()} onChange={(e) => setStatus(e.currentTarget.value)}>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>
          </Field>
          <Field label="Issue description" span="full">
            <textarea
              class={inputClass}
              rows={3}
              value={issueDescription()}
              disabled={readOnly()}
              onInput={(e) => setIssueDescription(e.currentTarget.value)}
            />
          </Field>
        </div>

        <Show when={!readOnly()}>
          <div class="flex justify-end gap-2 pt-2">
            <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={() => navigate("/app/after-sales/register-repair")}>
              Cancel
            </button>
            <button
              type="button"
              class="rounded-lg bg-brand px-4 py-2 text-sm text-white disabled:opacity-50"
              disabled={saving()}
              onClick={() => void save()}
            >
              {saving() ? "Saving…" : "Save"}
            </button>
          </div>
        </Show>
      </div>

      <ItemSearchModal open={itemPickerOpen()} onClose={() => setItemPickerOpen(false)} onSelect={onItemPicked} />
    </AfterSalesLayout>
  );
}
