import { For, Show, createMemo } from "solid-js";
import type { Accessor, Setter } from "solid-js";
import { inputClass } from "../../../shared/SpreadsheetGrid";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";

export type SaleCommissionRow = {
  line_no: number;
  tic_user_id?: number | null;
  tic_name: string;
  calc_mode: "percent" | "fixed";
  rate_value: string;
  notes?: string;
};

export function emptyCommissionRow(lineNo: number): SaleCommissionRow {
  return {
    line_no: lineNo,
    tic_user_id: null,
    tic_name: "",
    calc_mode: "percent",
    rate_value: "",
    notes: "",
  };
}

export function computeCommissionPreview(mode: "percent" | "fixed", rate: number, base: number): number {
  if (!(rate >= 0) || !(base >= 0)) return 0;
  if (mode === "fixed") return Math.round(rate * 10000) / 10000;
  return Math.round(((base * rate) / 100) * 10000) / 10000;
}

type Props = {
  rows: Accessor<SaleCommissionRow[]>;
  onChange: Setter<SaleCommissionRow[]>;
  grandTotal: Accessor<number>;
  fetchUsers: (q: string) => Promise<LookupOption[]>;
  disabled?: boolean;
};

export function SalesCommissionPanel(props: Props) {
  const totalCommission = createMemo(() =>
    props.rows().reduce((s, r) => {
      const rate = r.rate_value === "" ? 0 : Number(r.rate_value);
      return s + computeCommissionPreview(r.calc_mode, rate, props.grandTotal());
    }, 0),
  );

  const update = (idx: number, patch: Partial<SaleCommissionRow>) => {
    props.onChange(props.rows().map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const addRow = () => {
    props.onChange([...props.rows(), emptyCommissionRow(props.rows().length + 1)]);
  };

  const removeRow = (idx: number) => {
    props.onChange(
      props
        .rows()
        .filter((_, i) => i !== idx)
        .map((r, i) => ({ ...r, line_no: i + 1 })),
    );
  };

  return (
    <section class="col-span-full mt-4 rounded-xl border border-stroke bg-slate-50/80 p-4">
      <div class="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 class="text-sm font-semibold text-text-primary">Commissions (TIC)</h3>
          <p class="text-xs text-text-secondary">
            Optional. Add one or more Tech in Charge people. Use % of gross sales or a fixed amount — amounts
            recalculate from the invoice grand total (₱
            {props.grandTotal().toLocaleString("en-PH", { minimumFractionDigits: 2 })}).
          </p>
        </div>
        <button
          type="button"
          class="rounded border border-stroke bg-white px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
          disabled={props.disabled}
          onClick={addRow}
        >
          Add TIC
        </button>
      </div>

      <Show when={props.rows().length === 0}>
        <p class="text-xs text-text-secondary">No commission lines — leave empty if nobody is entitled on this sale.</p>
      </Show>

      <Show when={props.rows().length > 0}>
        <div class="space-y-3">
          <For each={props.rows()}>
            {(row, idx) => {
              const preview = () =>
                computeCommissionPreview(
                  row.calc_mode,
                  row.rate_value === "" ? 0 : Number(row.rate_value),
                  props.grandTotal(),
                );
              return (
                <div class="grid gap-2 rounded-lg border border-stroke bg-white p-3 sm:grid-cols-12">
                  <div class="sm:col-span-5">
                    <LookupCombo
                      label="TIC"
                      value={() => row.tic_name}
                      selectedId={() => row.tic_user_id ?? null}
                      onInput={(v) => update(idx(), { tic_name: v })}
                      onSelect={(o) => update(idx(), { tic_user_id: o.id, tic_name: o.label })}
                      onClear={() => update(idx(), { tic_user_id: null, tic_name: "" })}
                      fetchOptions={props.fetchUsers}
                      disabled={props.disabled}
                      placeholder="Search user or type name…"
                    />
                  </div>
                  <div class="sm:col-span-2">
                    <label class="block">
                      <span class="mb-1 block text-sm font-medium text-text-primary">Mode</span>
                      <select
                        class={inputClass}
                        disabled={props.disabled}
                        value={row.calc_mode}
                        onChange={(e) =>
                          update(idx(), { calc_mode: e.currentTarget.value as "percent" | "fixed" })
                        }
                      >
                        <option value="percent">Percent %</option>
                        <option value="fixed">Fixed ₱</option>
                      </select>
                    </label>
                  </div>
                  <div class="sm:col-span-2">
                    <label class="block">
                      <span class="mb-1 block text-sm font-medium text-text-primary">
                        {row.calc_mode === "percent" ? "Rate %" : "Amount ₱"}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        class={`${inputClass} text-right`}
                        disabled={props.disabled}
                        value={row.rate_value}
                        placeholder={row.calc_mode === "percent" ? "e.g. 5" : "e.g. 500"}
                        onInput={(e) => update(idx(), { rate_value: e.currentTarget.value })}
                      />
                    </label>
                  </div>
                  <div class="flex flex-col justify-end sm:col-span-2">
                    <span class="mb-1 block text-sm font-medium text-text-primary">Commission</span>
                    <p class="rounded border border-stroke bg-slate-50 px-2 py-2 text-right text-sm tabular-nums font-medium">
                      ₱{preview().toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div class="flex items-end sm:col-span-1">
                    <button
                      type="button"
                      class="w-full rounded border border-stroke px-2 py-2 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                      disabled={props.disabled}
                      onClick={() => removeRow(idx())}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            }}
          </For>
          <p class="text-right text-sm text-text-secondary">
            Total commissions:{" "}
            <span class="font-semibold tabular-nums text-text-primary">
              ₱{totalCommission().toLocaleString("en-PH", { minimumFractionDigits: 2 })}
            </span>
          </p>
        </div>
      </Show>
    </section>
  );
}
