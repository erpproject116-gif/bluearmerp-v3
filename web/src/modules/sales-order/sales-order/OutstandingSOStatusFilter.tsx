import { onMount, Show } from "solid-js";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { SalesOrderStatusFilter } from "./SalesOrderStatusFilter";
import {
  defaultOutstandingFilters,
  formatDisplayDate,
  thisMonthRange,
  todayISO,
  type OutstandingSOFilters,
} from "./salesOrderStatusFilters";

type Props = {
  value: () => OutstandingSOFilters;
  onChange: (next: OutstandingSOFilters) => void;
  onSearch: () => void;
  onReset: () => void;
};

export function OutstandingSOStatusFilter(props: Props) {
  const patch = (p: Partial<OutstandingSOFilters>) => props.onChange({ ...props.value(), ...p });

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
      <SalesOrderStatusFilter
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
          <Field label="Require stock">
            <select
              class={inputClass}
              value={props.value().require_stock === false ? "false" : "true"}
              onChange={(e) => patch({ require_stock: e.currentTarget.value === "true" })}
            >
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </Field>
          <Field label="Stock basis">
            <select class={inputClass} value={props.value().stock_basis ?? "location_out"} onChange={(e) => patch({ stock_basis: e.currentTarget.value })}>
              <option value="location_out">Location</option>
              <option value="total">Total</option>
            </select>
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

export { defaultOutstandingFilters, todayISO, thisMonthRange };
