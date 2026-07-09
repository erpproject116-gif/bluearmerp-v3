import { onMount, Show } from "solid-js";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { PurchaseOrderStatusFilter } from "./PurchaseOrderStatusFilter";
import {
  defaultOutstandingFilters,
  formatDisplayDate,
  type OutstandingPOFilters,
} from "./purchaseOrderStatusFilters";

type Props = {
  value: () => OutstandingPOFilters;
  onChange: (next: OutstandingPOFilters) => void;
  onSearch: () => void;
  onReset: () => void;
};

export function OutstandingPOStatusFilter(props: Props) {
  const patch = (p: Partial<OutstandingPOFilters>) => props.onChange({ ...props.value(), ...p });

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
    <div>
      <PurchaseOrderStatusFilter
        value={() => props.value()}
        onChange={(next) => props.onChange({ ...props.value(), ...next })}
        onSearch={() => props.onSearch()}
        onReset={() => props.onReset()}
      />
      <section class="mt-4 rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <h3 class="mb-3 text-sm font-semibold text-text-primary">Outstanding options</h3>
        <div class="grid gap-4 md:grid-cols-3">
          <Field label="Min balance qty">
            <input
              type="number"
              class={inputClass}
              value={props.value().min_balance_qty ?? 0.0001}
              onInput={(e) => patch({ min_balance_qty: Number(e.currentTarget.value) })}
            />
          </Field>
        </div>
        <div class="mt-3 flex flex-wrap gap-2 text-sm">
          <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700" onClick={() => props.onSearch()}>
            Search (F8)
          </button>
          <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm hover:bg-slate-50" onClick={() => props.onReset()}>
            Reset
          </button>
          <Show when={props.value().date_from && props.value().date_to}>
            <span class="ml-auto text-xs text-text-secondary">
              {formatDisplayDate(props.value().date_from)} – {formatDisplayDate(props.value().date_to)}
            </span>
          </Show>
        </div>
      </section>
    </div>
  );
}

export { defaultOutstandingFilters };
