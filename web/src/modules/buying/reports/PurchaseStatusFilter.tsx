import { createSignal, onMount } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";
import { DateInput } from "../../../shared/DateInput";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import {
  formatDisplayDate,
  thisMonthRange,
  todayISO,
  type PurchaseStatusFilters,
} from "../../../shared/reports/usePurchaseStatusReport";

type Props = {
  value: () => PurchaseStatusFilters;
  onChange: (next: PurchaseStatusFilters) => void;
  onSearch: () => void;
  onReset: () => void;
};

async function fetchVendors(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; company_name: string; partner_kind: string }[]>(`/api/v1/inventory/partners?${qs}`);
  return (res.data ?? [])
    .filter((p) => p.partner_kind === "supplier" || p.partner_kind === "both")
    .map((p) => ({ id: p.id, label: p.company_name }));
}

async function fetchItems(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; item_code: string; item_name: string }[]>(`/api/v1/inventory/items?${qs}`);
  return (res.data ?? []).map((i) => ({ id: i.id, label: `${i.item_code} — ${i.item_name}`, sublabel: i.item_code }));
}

export function PurchaseStatusFilter(props: Props) {
  const [vendorLabel, setVendorLabel] = createSignal("");
  const [itemLabel, setItemLabel] = createSignal("");
  const patch = (p: Partial<PurchaseStatusFilters>) => props.onChange({ ...props.value(), ...p });

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F8") {
        e.preventDefault();
        props.onSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
      <div class="mb-4">
        <h2 class="text-lg font-semibold text-text-primary">Purchase Status</h2>
        <p class="text-sm text-text-secondary">Date · Summary · by Line — set filters, then Search (F8).</p>
      </div>
      <div class="grid gap-4 md:grid-cols-2">
        <Field label="Date from">
          <DateInput value={props.value().date_from} onInput={(e) => patch({ date_from: e.currentTarget.value })} />
        </Field>
        <Field label="Date to">
          <DateInput value={props.value().date_to} onInput={(e) => patch({ date_to: e.currentTarget.value })} />
        </Field>
        <LookupCombo label="Vendor" value={vendorLabel} selectedId={() => props.value().partner_id ?? null} onInput={setVendorLabel} onSelect={(o) => { patch({ partner_id: o.id }); setVendorLabel(o.label); }} onClear={() => { patch({ partner_id: null }); setVendorLabel(""); }} fetchOptions={fetchVendors} />
        <LookupCombo label="Item" value={itemLabel} selectedId={() => props.value().item_id ?? null} onInput={setItemLabel} onSelect={(o) => { patch({ item_id: o.id }); setItemLabel(o.label); }} onClear={() => { patch({ item_id: null }); setItemLabel(""); }} fetchOptions={fetchItems} />
        <Field label="Progress status">
          <select class={inputClass} value={props.value().progress_status ?? ""} onChange={(e) => patch({ progress_status: e.currentTarget.value || undefined })}>
            <option value="">All</option>
            <option value="e_approval">e-Approval</option>
            <option value="unconfirmed">Unconfirmed</option>
            <option value="completed">Confirm</option>
          </select>
        </Field>
      </div>
      <div class="mt-4 flex flex-wrap items-center gap-2 border-t border-stroke pt-4">
        <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white" onClick={() => props.onSearch()}>Search (F8)</button>
        <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={() => props.onReset()}>Reset</button>
        <button type="button" class="text-sm text-brand-600 hover:underline" onClick={() => patch({ date_from: todayISO(), date_to: todayISO() })}>Today</button>
        <button type="button" class="text-sm text-brand-600 hover:underline" onClick={() => { const { from, to } = thisMonthRange(); patch({ date_from: from, date_to: to }); }}>This Month</button>
        <span class="ml-auto text-xs text-text-secondary">{formatDisplayDate(props.value().date_from)} – {formatDisplayDate(props.value().date_to)}</span>
      </div>
    </section>
  );
}
