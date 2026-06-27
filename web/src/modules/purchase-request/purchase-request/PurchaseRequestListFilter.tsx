import { createSignal, onMount, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";
import { DateInput } from "../../../shared/DateInput";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import {
  formatDisplayDate,
  thisMonthRange,
  todayISO,
  type PurchaseRequestListFilters,
} from "./purchaseRequestListFilters";
import { progressStatusLabel } from "./progressStatus";

type Props = {
  value: () => PurchaseRequestListFilters;
  onChange: (next: PurchaseRequestListFilters) => void;
  onSearch: () => void;
  onReset: () => void;
};

async function fetchPartners(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; company_name: string; partner_kind: string }[]>(`/api/v1/inventory/partners?${qs}`);
  return (res.data ?? [])
    .filter((p) => p.partner_kind === "vendor" || p.partner_kind === "customer" || p.partner_kind === "both")
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

async function fetchItems(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; item_code: string; item_name: string }[]>(`/api/v1/inventory/items?${qs}`);
  return (res.data ?? []).map((i) => ({ id: i.id, label: `${i.item_code} — ${i.item_name}`, sublabel: i.item_code }));
}

export function PurchaseRequestListFilter(props: Props) {
  const [locationLabel, setLocationLabel] = createSignal("");
  const [projectLabel, setProjectLabel] = createSignal("");
  const [partnerLabel, setPartnerLabel] = createSignal("");
  const [itemLabel, setItemLabel] = createSignal("");

  const patch = (p: Partial<PurchaseRequestListFilters>) => props.onChange({ ...props.value(), ...p });

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
        <h2 class="text-lg font-semibold text-text-primary">Purchase Request List</h2>
        <p class="text-sm text-text-secondary">Set filters, then Search (F8).</p>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <Field label="Date from">
          <DateInput value={props.value().date_from} onInput={(e) => patch({ date_from: e.currentTarget.value })} />
        </Field>
        <Field label="Date to">
          <DateInput value={props.value().date_to} onInput={(e) => patch({ date_to: e.currentTarget.value })} />
        </Field>
        <Field label="PR No.">
          <input class={inputClass} value={props.value().purchase_request_no ?? ""} onInput={(e) => patch({ purchase_request_no: e.currentTarget.value })} />
        </Field>
        <Field label="Keyword">
          <input class={inputClass} value={props.value().q ?? ""} onInput={(e) => patch({ q: e.currentTarget.value })} placeholder="PR no., partner, item…" />
        </Field>
        <LookupCombo label="Location" value={locationLabel} selectedId={() => props.value().location_id ?? null} onInput={setLocationLabel} onSelect={(o) => { patch({ location_id: o.id }); setLocationLabel(o.label); }} onClear={() => { patch({ location_id: null }); setLocationLabel(""); }} fetchOptions={fetchLocations} />
        <LookupCombo label="Project" value={projectLabel} selectedId={() => props.value().project_id ?? null} onInput={setProjectLabel} onSelect={(o) => { patch({ project_id: o.id }); setProjectLabel(o.label); }} onClear={() => { patch({ project_id: null }); setProjectLabel(""); }} fetchOptions={fetchProjects} />
        <LookupCombo label="Customer / Vendor" value={partnerLabel} selectedId={() => props.value().partner_id ?? null} onInput={setPartnerLabel} onSelect={(o) => { patch({ partner_id: o.id }); setPartnerLabel(o.label); }} onClear={() => { patch({ partner_id: null }); setPartnerLabel(""); }} fetchOptions={fetchPartners} />
        <LookupCombo label="Item" value={itemLabel} selectedId={() => props.value().item_id ?? null} onInput={setItemLabel} onSelect={(o) => { patch({ item_id: o.id }); setItemLabel(o.label); }} onClear={() => { patch({ item_id: null }); setItemLabel(""); }} fetchOptions={fetchItems} />
        <Field label="Domestic / Foreign">
          <div class="flex flex-wrap gap-4 text-sm">
            <label class="flex items-center gap-1.5">
              <input type="radio" name="list_domestic_foreign" checked={(props.value().domestic_foreign ?? "all") === "all"} onChange={() => patch({ domestic_foreign: "all" })} />
              All
            </label>
            <label class="flex items-center gap-1.5">
              <input type="radio" name="list_domestic_foreign" checked={props.value().domestic_foreign === "domestic"} onChange={() => patch({ domestic_foreign: "domestic" })} />
              Domestic
            </label>
            <label class="flex items-center gap-1.5">
              <input type="radio" name="list_domestic_foreign" checked={props.value().domestic_foreign === "foreign"} onChange={() => patch({ domestic_foreign: "foreign" })} />
              Foreign
            </label>
          </div>
        </Field>
        <Field label="Send status">
          <div class="flex flex-wrap gap-4 text-sm">
            <label class="flex items-center gap-1.5">
              <input type="radio" name="list_send_status" checked={(props.value().send_status ?? "all") === "all"} onChange={() => patch({ send_status: "all" })} />
              All
            </label>
            <label class="flex items-center gap-1.5">
              <input type="radio" name="list_send_status" checked={props.value().send_status === "unsent"} onChange={() => patch({ send_status: "unsent" })} />
              Unsent
            </label>
            <label class="flex items-center gap-1.5">
              <input type="radio" name="list_send_status" checked={props.value().send_status === "sent"} onChange={() => patch({ send_status: "sent" })} />
              Sent
            </label>
          </div>
        </Field>
        <Field label="Progress status">
          <select class={inputClass} value={props.value().progress_status ?? ""} onChange={(e) => patch({ progress_status: e.currentTarget.value || undefined })}>
            <option value="">All</option>
            <option value="unconfirmed">{progressStatusLabel("unconfirmed")}</option>
            <option value="e_approval">{progressStatusLabel("e_approval")}</option>
            <option value="confirmed">{progressStatusLabel("confirmed")}</option>
            <option value="in_progress">{progressStatusLabel("in_progress")}</option>
            <option value="completed">{progressStatusLabel("completed")}</option>
          </select>
        </Field>
        <Field label="Sort options">
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={props.value().sort_by_modified ?? false} onChange={(e) => patch({ sort_by_modified: e.currentTarget.checked })} />
            Sort by Modified Date
          </label>
        </Field>
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
