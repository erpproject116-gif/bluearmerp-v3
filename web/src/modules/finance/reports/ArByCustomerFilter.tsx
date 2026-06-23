import { createSignal, onMount } from "solid-js";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";
import { DateInput } from "../../../shared/DateInput";
import { Field } from "../../../shared/SpreadsheetGrid";
import { apiFetch } from "../../../shared/api";
import type { ArByCustomerFilters } from "./arByCustomerFilters";

type Props = {
  value: () => ArByCustomerFilters;
  onChange: (next: ArByCustomerFilters) => void;
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

export function ArByCustomerFilter(props: Props) {
  const [customerLabel, setCustomerLabel] = createSignal("");
  const patch = (p: Partial<ArByCustomerFilters>) => props.onChange({ ...props.value(), ...p });

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
        <h2 class="text-lg font-semibold text-text-primary">A/R by Customer</h2>
        <p class="text-sm text-text-secondary">Outstanding balances per customer — Search (F8).</p>
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
          label="Customer"
          value={customerLabel}
          selectedId={() => props.value().partner_id ?? null}
          onInput={setCustomerLabel}
          onSelect={(o) => {
            patch({ partner_id: o.id });
            setCustomerLabel(o.label);
          }}
          onClear={() => {
            patch({ partner_id: null });
            setCustomerLabel("");
          }}
          fetchOptions={fetchPartners}
        />
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
