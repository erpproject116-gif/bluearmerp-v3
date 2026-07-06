import { createEffect, createSignal, For, Show } from "solid-js";
import { formatPeso } from "../../../shared/money";
import type { PriceBatchLineRow } from "../../../shared/usePriceBatchLines";
import { inputClass } from "../../../shared/SpreadsheetGrid";
import { progressStatusLabel } from "./progressStatus";

export type EditablePriceBatchRow = PriceBatchLineRow & {
  edit_unit_non_vat: string;
  dirty: boolean;
};

type Props = {
  rows: PriceBatchLineRow[];
  loading: boolean;
  page: number;
  pageSize: number;
  totalRows: number;
  onPageChange: (page: number) => void;
  onRowsChange: (rows: EditablePriceBatchRow[]) => void;
  editableRows: () => EditablePriceBatchRow[];
};



function initEditable(rows: PriceBatchLineRow[]): EditablePriceBatchRow[] {
  return rows.map((r) => ({
    ...r,
    edit_unit_non_vat: String(r.unit_non_vat),
    dirty: false,
  }));
}

export function ChangeSalesPriceBatchGrid(props: Props) {
  const [localRows, setLocalRows] = createSignal<EditablePriceBatchRow[]>([]);

  createEffect(() => {
    const incoming = props.rows;
    const current = props.editableRows();
    if (current.length > 0 && current.some((r) => r.dirty)) return;
    const next = initEditable(incoming);
    setLocalRows(next);
    props.onRowsChange(next);
  });

  const totalPages = () => Math.max(1, Math.ceil(props.totalRows / props.pageSize));

  const updateUnit = (lineId: number, value: string) => {
    setLocalRows((prev) => {
      const next = prev.map((r) =>
        r.line_id === lineId
          ? { ...r, edit_unit_non_vat: value, dirty: value !== String(r.unit_non_vat) }
          : r,
      );
      props.onRowsChange(next);
      return next;
    });
  };

  const displayRows = () => (localRows().length ? localRows() : initEditable(props.rows));

  return (
    <section class="mt-6 rounded-xl border border-stroke bg-white shadow-sm">
      <div class="overflow-x-auto">
        <table class="erp-grid min-w-full text-left text-sm">
          <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
            <tr>
              <th class="px-3 py-2">Date-No.</th>
              <th class="px-3 py-2">Sales No.</th>
              <th class="px-3 py-2">Customer</th>
              <th class="px-3 py-2">Item</th>
              <th class="px-3 py-2 text-right">Qty</th>
              <th class="px-3 py-2 text-right">Unit (Non-VAT)</th>
              <th class="px-3 py-2 text-right">Non-VAT Total</th>
              <th class="px-3 py-2 text-right">Tax</th>
              <th class="px-3 py-2">Progress</th>
            </tr>
          </thead>
          <tbody>
            <Show when={props.loading}>
              <tr>
                <td colSpan={9} class="px-3 py-8 text-center text-text-secondary">
                  Loading…
                </td>
              </tr>
            </Show>
            <Show when={!props.loading && displayRows().length === 0}>
              <tr>
                <td colSpan={9} class="px-3 py-8 text-center text-text-secondary">
                  No rows match your filters.
                </td>
              </tr>
            </Show>
            <For each={displayRows()}>
              {(row) => (
                <tr class="border-t border-stroke/60 hover:bg-slate-50/50" classList={{ "bg-amber-50/40": row.dirty }}>
                  <td class="px-3 py-2">{row.date_no_display}</td>
                  <td class="px-3 py-2">{row.sales_no}</td>
                  <td class="px-3 py-2">{row.customer_name}</td>
                  <td class="px-3 py-2">
                    {row.item_code} — {row.item_name}
                  </td>
                  <td class="px-3 py-2 text-right">{row.qty}</td>
                  <td class="px-3 py-2 text-right">
                    <input
                      type="number"
                      class={`${inputClass} w-28 text-right`}
                      value={row.edit_unit_non_vat}
                      onInput={(e) => updateUnit(row.line_id, e.currentTarget.value)}
                    />
                  </td>
                  <td class="px-3 py-2 text-right">{formatPeso(row.non_vat_total)}</td>
                  <td class="px-3 py-2 text-right">{formatPeso(row.tax_amount)}</td>
                  <td class="px-3 py-2">{progressStatusLabel(row.progress_status)}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3 border-t border-stroke px-5 py-3 text-xs text-text-secondary">
        <span>[P.{props.page}]</span>
        <div class="flex gap-2">
          <button type="button" class="rounded border border-stroke px-2 py-1 disabled:opacity-40" disabled={props.page <= 1} onClick={() => props.onPageChange(props.page - 1)}>
            Prev
          </button>
          <button type="button" class="rounded border border-stroke px-2 py-1 disabled:opacity-40" disabled={props.page >= totalPages()} onClick={() => props.onPageChange(props.page + 1)}>
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
