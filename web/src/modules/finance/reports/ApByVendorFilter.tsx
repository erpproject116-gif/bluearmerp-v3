import { createSignal, onMount } from "solid-js";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";
import { DateInput } from "../../../shared/DateInput";
import { Field } from "../../../shared/SpreadsheetGrid";
import { apiFetch } from "../../../shared/api";
import type { ApByVendorFilters } from "./apByVendorFilters";

type Props = {
  value: () => ApByVendorFilters;
  onChange: (next: ApByVendorFilters) => void;
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

export function ApByVendorFilter(props: Props) {
  const [vendorLabel, setVendorLabel] = createSignal("");
  const [locationLabel, setLocationLabel] = createSignal("");
  const [projectLabel, setProjectLabel] = createSignal("");
  const [picLabel, setPicLabel] = createSignal("");
  const patch = (p: Partial<ApByVendorFilters>) => props.onChange({ ...props.value(), ...p });

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
        <h2 class="text-lg font-semibold text-text-primary">A/P by Vendor</h2>
        <p class="text-sm text-text-secondary">Outstanding balances per vendor — Search (F8).</p>
      </div>
      <div class="grid gap-4 md:grid-cols-2">
        <Field label="Date from (optional)">
          <DateInput
            value={props.value().date_from ?? ""}
            onInput={(e) => patch({ date_from: e.currentTarget.value || undefined })}
          />
        </Field>
        <Field label="Date to (optional)">
          <DateInput
            value={props.value().date_to ?? ""}
            onInput={(e) => patch({ date_to: e.currentTarget.value || undefined })}
          />
        </Field>
        <LookupCombo
          label="Vendor"
          value={vendorLabel}
          selectedId={() => props.value().partner_id ?? null}
          onInput={setVendorLabel}
          onSelect={(o) => {
            patch({ partner_id: o.id });
            setVendorLabel(o.label);
          }}
          onClear={() => {
            patch({ partner_id: null });
            setVendorLabel("");
          }}
          fetchOptions={fetchVendors}
        />
        <LookupCombo label="Location" value={locationLabel} selectedId={() => props.value().location_id ?? null} onInput={setLocationLabel} onSelect={(o) => { patch({ location_id: o.id }); setLocationLabel(o.label); }} onClear={() => { patch({ location_id: null }); setLocationLabel(""); }} fetchOptions={fetchLocations} />
        <LookupCombo label="Project" value={projectLabel} selectedId={() => props.value().project_id ?? null} onInput={setProjectLabel} onSelect={(o) => { patch({ project_id: o.id }); setProjectLabel(o.label); }} onClear={() => { patch({ project_id: null }); setProjectLabel(""); }} fetchOptions={fetchProjects} />
        <LookupCombo label="PIC" value={picLabel} selectedId={() => props.value().pic_user_id ?? null} onInput={setPicLabel} onSelect={(o) => { patch({ pic_user_id: o.id }); setPicLabel(o.label); }} onClear={() => { patch({ pic_user_id: null }); setPicLabel(""); }} fetchOptions={fetchUsers} />
      </div>
      <div class="mt-4 flex flex-wrap gap-2 border-t border-stroke pt-4">
        <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700" onClick={() => props.onSearch()}>
          Search (F8)
        </button>
        <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm text-text-secondary hover:bg-slate-50" onClick={() => props.onReset()}>
          Reset
        </button>
      </div>
    </section>
  );
}
