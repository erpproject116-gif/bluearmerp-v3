import { createSignal, onMount, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";
import { DateInput } from "../../../shared/DateInput";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import {
  formatDisplayDate,
  thisMonthRange,
  todayISO,
  type PurchaseOrderStatusFilters,
} from "./purchaseOrderStatusFilters";

type Props = {
  value: () => PurchaseOrderStatusFilters;
  onChange: (next: PurchaseOrderStatusFilters) => void;
  onSearch: () => void;
  onReset: () => void;
};

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
  const res = await apiFetch<{ id: number; full_name: string }[]>(`/api/v1/inventory/after-sales/users${qs}`);
  return (res.data ?? []).map((u) => ({ id: u.id, label: u.full_name }));
}

async function fetchItems(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; item_code: string; item_name: string }[]>(`/api/v1/inventory/items?${qs}`);
  return (res.data ?? []).map((i) => ({ id: i.id, label: `${i.item_code} — ${i.item_name}`, sublabel: i.item_code }));
}

async function fetchTaxTypes(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; name: string }[]>(`/api/v1/quotation/tax-types?${qs}`);
  return (res.data ?? []).map((t) => ({ id: t.id, label: t.name }));
}

export function PurchaseOrderStatusFilter(props: Props) {
  const [locationLabel, setLocationLabel] = createSignal("");
  const [projectLabel, setProjectLabel] = createSignal("");
  const [picLabel, setPicLabel] = createSignal("");
  const [vendorLabel, setVendorLabel] = createSignal("");
  const [itemLabel, setItemLabel] = createSignal("");
  const [taxTypeLabel, setTaxTypeLabel] = createSignal("");

  const patch = (p: Partial<PurchaseOrderStatusFilters>) => props.onChange({ ...props.value(), ...p });

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
        <h2 class="text-lg font-semibold text-text-primary">Purchase Order Status</h2>
        <p class="text-sm text-text-secondary">Details · by Line — set filters, then Search (F8).</p>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <Field label="Date from">
          <DateInput value={props.value().date_from} onInput={(e) => patch({ date_from: e.currentTarget.value })} />
        </Field>
        <Field label="Date to">
          <DateInput value={props.value().date_to} onInput={(e) => patch({ date_to: e.currentTarget.value })} />
        </Field>
        <LookupCombo label="Location" value={locationLabel} selectedId={() => props.value().location_id ?? null} onInput={setLocationLabel} onSelect={(o) => { patch({ location_id: o.id }); setLocationLabel(o.label); }} onClear={() => { patch({ location_id: null }); setLocationLabel(""); }} fetchOptions={fetchLocations} />
        <LookupCombo label="Project" value={projectLabel} selectedId={() => props.value().project_id ?? null} onInput={setProjectLabel} onSelect={(o) => { patch({ project_id: o.id }); setProjectLabel(o.label); }} onClear={() => { patch({ project_id: null }); setProjectLabel(""); }} fetchOptions={fetchProjects} />
        <LookupCombo label="PIC" value={picLabel} selectedId={() => props.value().pic_user_id ?? null} onInput={setPicLabel} onSelect={(o) => { patch({ pic_user_id: o.id }); setPicLabel(o.label); }} onClear={() => { patch({ pic_user_id: null }); setPicLabel(""); }} fetchOptions={fetchUsers} />
        <Field label="Progress status">
          <select class={inputClass} value={props.value().progress_status ?? ""} onChange={(e) => patch({ progress_status: e.currentTarget.value || undefined })}>
            <option value="">All</option>
            <option value="unconfirmed">Unconfirmed</option>
            <option value="e_approval">E-Approval</option>
            <option value="completed">Completed</option>
          </select>
        </Field>
        <Field label="Document status">
          <select class={inputClass} value={props.value().status ?? ""} onChange={(e) => patch({ status: e.currentTarget.value || undefined })}>
            <option value="">All</option>
            <option value="draft">Draft</option>
            <option value="confirmed">Confirmed</option>
            <option value="partially_received">Partially Received</option>
            <option value="received">Received</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </Field>
        <LookupCombo label="Vendor" value={vendorLabel} selectedId={() => props.value().partner_id ?? null} onInput={setVendorLabel} onSelect={(o) => { patch({ partner_id: o.id }); setVendorLabel(o.label); }} onClear={() => { patch({ partner_id: null }); setVendorLabel(""); }} fetchOptions={fetchVendors} />
        <LookupCombo label="Item" value={itemLabel} selectedId={() => props.value().item_id ?? null} onInput={setItemLabel} onSelect={(o) => { patch({ item_id: o.id }); setItemLabel(o.label); }} onClear={() => { patch({ item_id: null }); setItemLabel(""); }} fetchOptions={fetchItems} />
        <LookupCombo label="Transaction type" value={taxTypeLabel} selectedId={() => props.value().tax_type_id ?? null} onInput={setTaxTypeLabel} onSelect={(o) => { patch({ tax_type_id: o.id }); setTaxTypeLabel(o.label); }} onClear={() => { patch({ tax_type_id: null }); setTaxTypeLabel(""); }} fetchOptions={fetchTaxTypes} />
      </div>

      <div class="mt-4 flex flex-wrap items-center gap-2 border-t border-stroke pt-4">
        <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700" onClick={() => props.onSearch()}>
          Search (F8)
        </button>
        <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm text-text-secondary hover:bg-slate-50" onClick={() => props.onReset()}>
          Reset
        </button>
        <button type="button" class="text-sm text-brand-600 hover:underline" onClick={() => patch({ date_from: todayISO(), date_to: todayISO() })}>
          Today
        </button>
        <button type="button" class="text-sm text-brand-600 hover:underline" onClick={() => { const { from, to } = thisMonthRange(); patch({ date_from: from, date_to: to }); }}>
          This Month (~ Today)
        </button>
        <Show when={props.value().date_from && props.value().date_to}>
          <span class="ml-auto text-xs text-text-secondary">
            {formatDisplayDate(props.value().date_from)} – {formatDisplayDate(props.value().date_to)}
          </span>
        </Show>
      </div>
    </section>
  );
}
