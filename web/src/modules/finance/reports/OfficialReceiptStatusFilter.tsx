import { createSignal, onMount } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";
import { DateInput } from "../../../shared/DateInput";
import { Field } from "../../../shared/SpreadsheetGrid";
import type { OfficialReceiptStatusFilters } from "./officialReceiptStatusFilters";

type Props = {
  value: () => OfficialReceiptStatusFilters;
  onChange: (next: OfficialReceiptStatusFilters) => void;
  onSearch: () => void;
  onReset: () => void;
};

async function fetchPartners(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; company_name: string; partner_kind: string }[]>(`/api/v1/inventory/partners?${qs}`);
  return (res.data ?? [])
    .filter((p) => p.partner_kind === "customer" || p.partner_kind === "both")
    .map((p) => ({ id: p.id, label: p.company_name }));
}

async function fetchLocations(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; location_name: string }[]>(`/api/v1/inventory/locations?${qs}`);
  return (res.data ?? []).map((l) => ({ id: l.id, label: l.location_name }));
}

async function fetchDepartments(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; name: string }[]>(`/api/v1/inventory/departments?${qs}`);
  return (res.data ?? []).map((d) => ({ id: d.id, label: d.name }));
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

export function OfficialReceiptStatusFilter(props: Props) {
  const [customerLabel, setCustomerLabel] = createSignal("");
  const [locationLabel, setLocationLabel] = createSignal("");
  const [departmentLabel, setDepartmentLabel] = createSignal("");
  const [projectLabel, setProjectLabel] = createSignal("");
  const [picLabel, setPicLabel] = createSignal("");
  const [createdByLabel, setCreatedByLabel] = createSignal("");
  const [updatedByLabel, setUpdatedByLabel] = createSignal("");
  const patch = (p: Partial<OfficialReceiptStatusFilters>) => props.onChange({ ...props.value(), ...p });

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
        <h2 class="text-lg font-semibold text-text-primary">Official Receipt Status</h2>
        <p class="text-sm text-text-secondary">Official receipt headers by date range — Search (F8).</p>
      </div>
      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Field label="Date from">
          <DateInput value={props.value().date_from} onInput={(e) => patch({ date_from: e.currentTarget.value })} />
        </Field>
        <Field label="Date to">
          <DateInput value={props.value().date_to} onInput={(e) => patch({ date_to: e.currentTarget.value })} />
        </Field>
        <LookupCombo label="Customer" value={customerLabel} selectedId={() => props.value().partner_id ?? null} onInput={setCustomerLabel} onSelect={(o) => { patch({ partner_id: o.id }); setCustomerLabel(o.label); }} onClear={() => { patch({ partner_id: null }); setCustomerLabel(""); }} fetchOptions={fetchPartners} />
        <LookupCombo label="Location" value={locationLabel} selectedId={() => props.value().location_id ?? null} onInput={setLocationLabel} onSelect={(o) => { patch({ location_id: o.id }); setLocationLabel(o.label); }} onClear={() => { patch({ location_id: null }); setLocationLabel(""); }} fetchOptions={fetchLocations} />
        <LookupCombo label="Department" value={departmentLabel} selectedId={() => props.value().department_id ?? null} onInput={setDepartmentLabel} onSelect={(o) => { patch({ department_id: o.id }); setDepartmentLabel(o.label); }} onClear={() => { patch({ department_id: null }); setDepartmentLabel(""); }} fetchOptions={fetchDepartments} />
        <LookupCombo label="Project" value={projectLabel} selectedId={() => props.value().project_id ?? null} onInput={setProjectLabel} onSelect={(o) => { patch({ project_id: o.id }); setProjectLabel(o.label); }} onClear={() => { patch({ project_id: null }); setProjectLabel(""); }} fetchOptions={fetchProjects} />
        <LookupCombo label="PIC" value={picLabel} selectedId={() => props.value().pic_user_id ?? null} onInput={setPicLabel} onSelect={(o) => { patch({ pic_user_id: o.id }); setPicLabel(o.label); }} onClear={() => { patch({ pic_user_id: null }); setPicLabel(""); }} fetchOptions={fetchUsers} />
        <LookupCombo label="Initial Creator" value={createdByLabel} selectedId={() => props.value().created_by_user_id ?? null} onInput={setCreatedByLabel} onSelect={(o) => { patch({ created_by_user_id: o.id }); setCreatedByLabel(o.label); }} onClear={() => { patch({ created_by_user_id: null }); setCreatedByLabel(""); }} fetchOptions={fetchUsers} />
        <LookupCombo label="Last Modifier" value={updatedByLabel} selectedId={() => props.value().updated_by_user_id ?? null} onInput={setUpdatedByLabel} onSelect={(o) => { patch({ updated_by_user_id: o.id }); setUpdatedByLabel(o.label); }} onClear={() => { patch({ updated_by_user_id: null }); setUpdatedByLabel(""); }} fetchOptions={fetchUsers} />
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
