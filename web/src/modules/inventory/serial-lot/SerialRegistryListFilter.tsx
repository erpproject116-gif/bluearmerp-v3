import { createSignal, onMount } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";
import { DateInput } from "../../../shared/DateInput";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import {
  defaultSerialRegistryFilters,
  SERIAL_STATUS_OPTIONS,
  type SerialRegistryFilters,
} from "./serialRegistryFilters";

type Props = {
  value: () => SerialRegistryFilters;
  onChange: (next: SerialRegistryFilters) => void;
  onSearch: () => void;
  onReset: () => void;
  title?: string;
};

async function fetchLocations(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; location_name: string }[]>(`/api/v1/inventory/locations?${qs}`);
  return (res.data ?? []).map((l) => ({ id: l.id, label: l.location_name }));
}

async function fetchItems(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; item_code: string; item_name: string }[]>(`/api/v1/inventory/items?${qs}`);
  return (res.data ?? []).map((i) => ({ id: i.id, label: `${i.item_code} — ${i.item_name}`, sublabel: i.item_code }));
}

export function SerialRegistryListFilter(props: Props) {
  const [locationLabel, setLocationLabel] = createSignal("");
  const [itemLabel, setItemLabel] = createSignal("");

  const patch = (p: Partial<SerialRegistryFilters>) => props.onChange({ ...props.value(), ...p });

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
        <h2 class="text-lg font-semibold text-text-primary">{props.title ?? "Serial Registry"}</h2>
        <p class="text-sm text-text-secondary">Set filters, then Search (F8).</p>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <Field label="Keyword">
          <input
            class={inputClass}
            value={props.value().q ?? ""}
            onInput={(e) => patch({ q: e.currentTarget.value })}
            placeholder="Serial, item code, item name…"
          />
        </Field>
        <Field label="Serial no.">
          <input
            class={inputClass}
            value={props.value().serial_no ?? ""}
            onInput={(e) => patch({ serial_no: e.currentTarget.value })}
          />
        </Field>
        <Field label="Status">
          <select
            class={inputClass}
            value={props.value().status ?? ""}
            onChange={(e) => patch({ status: e.currentTarget.value || undefined })}
          >
            {SERIAL_STATUS_OPTIONS.map((o) => (
              <option value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <LookupCombo
          label="Item"
          value={itemLabel}
          selectedId={() => props.value().item_id ?? null}
          onInput={setItemLabel}
          onSelect={(o) => {
            patch({ item_id: o.id });
            setItemLabel(o.label);
          }}
          onClear={() => {
            patch({ item_id: null });
            setItemLabel("");
          }}
          fetchOptions={fetchItems}
        />
        <LookupCombo
          label="Location"
          value={locationLabel}
          selectedId={() => props.value().location_id ?? null}
          onInput={setLocationLabel}
          onSelect={(o) => {
            patch({ location_id: o.id });
            setLocationLabel(o.label);
          }}
          onClear={() => {
            patch({ location_id: null });
            setLocationLabel("");
          }}
          fetchOptions={fetchLocations}
        />
        <Field label="Warranty end from">
          <DateInput
            value={props.value().warranty_end_from ?? ""}
            onInput={(e) => patch({ warranty_end_from: e.currentTarget.value })}
          />
        </Field>
        <Field label="Warranty end to">
          <DateInput
            value={props.value().warranty_end_to ?? ""}
            onInput={(e) => patch({ warranty_end_to: e.currentTarget.value })}
          />
        </Field>
      </div>

      <div class="mt-4 flex flex-wrap items-center gap-2 border-t border-stroke pt-4">
        <button
          type="button"
          class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          onClick={() => props.onSearch()}
        >
          Search (F8)
        </button>
        <button
          type="button"
          class="rounded-lg border border-stroke px-4 py-2 text-sm text-text-secondary hover:bg-slate-50"
          onClick={() => {
            props.onReset();
            setLocationLabel("");
            setItemLabel("");
          }}
        >
          Reset
        </button>
      </div>
    </section>
  );
}

export { defaultSerialRegistryFilters };
