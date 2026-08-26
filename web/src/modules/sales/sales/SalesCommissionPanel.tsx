import { For, Index, Show, createMemo } from "solid-js";
import type { Accessor, Setter } from "solid-js";
import { inputClass } from "../../../shared/SpreadsheetGrid";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";
import { formatPeso } from "../../../shared/money";

export type SaleCommissionScope = "transaction" | "item";

export type SaleCommissionRow = {
  line_no: number;
  tic_user_id?: number | null;
  tic_name: string;
  calc_mode: "percent" | "fixed";
  rate_value: string;
  notes?: string;
  scope: SaleCommissionScope;
  sales_line_no?: number | null;
  sales_line_id?: number | null;
};

export type CommissionSaleLineOption = {
  line_no: number;
  id?: number | null;
  label: string;
  line_total: number;
};

export function emptyCommissionRow(lineNo: number): SaleCommissionRow {
  return {
    line_no: lineNo,
    tic_user_id: null,
    tic_name: "",
    calc_mode: "percent",
    rate_value: "",
    notes: "",
    scope: "transaction",
    sales_line_no: null,
    sales_line_id: null,
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
  saleLines: Accessor<CommissionSaleLineOption[]>;
  fetchUsers: (q: string) => Promise<LookupOption[]>;
  disabled?: boolean;
};

export function SalesCommissionPanel(props: Props) {
  const baseFor = (row: SaleCommissionRow) => {
    if (row.scope === "item" && row.sales_line_no) {
      const ln = props.saleLines().find((l) => l.line_no === row.sales_line_no);
      return ln?.line_total ?? 0;
    }
    return props.grandTotal();
  };

  const totalCommission = createMemo(() =>
    props.rows().reduce((s, r) => {
      const rate = r.rate_value === "" ? 0 : Number(r.rate_value);
      return s + computeCommissionPreview(r.calc_mode, rate, baseFor(r));
    }, 0),
  );

  const update = (idx: number, patch: Partial<SaleCommissionRow>) => {
    props.onChange(props.rows().map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const addRow = (scope: SaleCommissionScope = "transaction") => {
    props.onChange([
      ...props.rows(),
      {
        ...emptyCommissionRow(props.rows().length + 1),
        scope,
      },
    ]);
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
            Flexible: pay TIC on the whole invoice (transaction) or on a single item line. Percent uses that
            base; fixed is a flat amount. Invoice total: {formatPeso(props.grandTotal())}.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded border border-stroke bg-white px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
            disabled={props.disabled}
            onClick={() => addRow("transaction")}
          >
            + Per transaction
          </button>
          <button
            type="button"
            class="rounded border border-stroke bg-white px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
            disabled={props.disabled || props.saleLines().length === 0}
            title={props.saleLines().length === 0 ? "Add sale lines first" : undefined}
            onClick={() => addRow("item")}
          >
            + Per item
          </button>
        </div>
      </div>

      <Show when={props.rows().length === 0}>
        <p class="text-xs text-text-secondary">No commission lines — leave empty if nobody is entitled on this sale.</p>
      </Show>

      <Show when={props.rows().length > 0}>
        <div class="space-y-3">
          {/* Index (not For): row object identity changes on each keystroke — For would remount inputs. */}
          <Index each={props.rows()}>
            {(row, idx) => {
              const preview = () =>
                computeCommissionPreview(
                  row().calc_mode,
                  row().rate_value === "" ? 0 : Number(row().rate_value),
                  baseFor(row()),
                );
              return (
                <div class="grid gap-2 rounded-lg border border-stroke bg-white p-3 sm:grid-cols-12">
                  <div class="sm:col-span-3">
                    <LookupCombo
                      label="TIC"
                      value={() => row().tic_name}
                      selectedId={() => row().tic_user_id ?? null}
                      onInput={(v) => update(idx, { tic_name: v })}
                      onSelect={(o) => update(idx, { tic_user_id: o.id, tic_name: o.label })}
                      onClear={() => update(idx, { tic_user_id: null, tic_name: "" })}
                      fetchOptions={props.fetchUsers}
                      disabled={props.disabled}
                      placeholder="Search user or type name…"
                    />
                  </div>
                  <div class="sm:col-span-2">
                    <label class="block">
                      <span class="mb-1 block text-sm font-medium text-text-primary">Applies to</span>
                      <select
                        class={inputClass}
                        disabled={props.disabled}
                        value={row().scope}
                        onChange={(e) => {
                          const scope = e.currentTarget.value as SaleCommissionScope;
                          update(idx, {
                            scope,
                            sales_line_no: scope === "transaction" ? null : row().sales_line_no,
                            sales_line_id: scope === "transaction" ? null : row().sales_line_id,
                          });
                        }}
                      >
                        <option value="transaction">Whole sale</option>
                        <option value="item">Item line</option>
                      </select>
                    </label>
                  </div>
                  <Show when={row().scope === "item"}>
                    <div class="sm:col-span-3">
                      <label class="block">
                        <span class="mb-1 block text-sm font-medium text-text-primary">Sale line</span>
                        <select
                          class={inputClass}
                          disabled={props.disabled}
                          value={row().sales_line_no ?? ""}
                          onChange={(e) => {
                            const no = Number(e.currentTarget.value) || null;
                            const ln = props.saleLines().find((l) => l.line_no === no);
                            update(idx, {
                              sales_line_no: no,
                              sales_line_id: ln?.id ?? null,
                            });
                          }}
                        >
                          <option value="">Select line…</option>
                          <For each={props.saleLines()}>
                            {(ln) => (
                              <option value={ln.line_no}>
                                #{ln.line_no} {ln.label} ({formatPeso(ln.line_total)})
                              </option>
                            )}
                          </For>
                        </select>
                      </label>
                    </div>
                  </Show>
                  <div class="sm:col-span-2">
                    <label class="block">
                      <span class="mb-1 block text-sm font-medium text-text-primary">Mode</span>
                      <select
                        class={inputClass}
                        disabled={props.disabled}
                        value={row().calc_mode}
                        onChange={(e) =>
                          update(idx, { calc_mode: e.currentTarget.value as "percent" | "fixed" })
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
                        {row().calc_mode === "percent" ? "Rate %" : "Amount ₱"}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        class={`${inputClass} text-right`}
                        disabled={props.disabled}
                        value={row().rate_value}
                        placeholder={row().calc_mode === "percent" ? "e.g. 5" : "e.g. 500"}
                        onInput={(e) => update(idx, { rate_value: e.currentTarget.value })}
                      />
                    </label>
                  </div>
                  <div class="flex flex-col justify-end sm:col-span-2">
                    <span class="mb-1 block text-sm font-medium text-text-primary">
                      Commission
                      <span class="ml-1 font-normal text-text-secondary">
                        (base {formatPeso(baseFor(row()))})
                      </span>
                    </span>
                    <p class="rounded border border-stroke bg-slate-50 px-2 py-2 text-right text-sm font-medium tabular-nums">
                      {formatPeso(preview())}
                    </p>
                  </div>
                  <div class="flex items-end sm:col-span-1">
                    <button
                      type="button"
                      class="w-full rounded border border-stroke px-2 py-2 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                      disabled={props.disabled}
                      onClick={() => removeRow(idx)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            }}
          </Index>
          <p class="text-right text-sm text-text-secondary">
            Total commissions:{" "}
            <span class="font-semibold tabular-nums text-text-primary">
              {formatPeso(totalCommission())}
            </span>
          </p>
        </div>
      </Show>
    </section>
  );
}
