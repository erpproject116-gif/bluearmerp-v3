import { For, Show } from "solid-js";
import { EntityModal } from "../../../shared/SpreadsheetGrid";
import { formatMoney } from "../../../shared/money";

export type ProfitLineRow = {
  line_no: number;
  item_code: string;
  item_name: string;
  qty: number;
  sell_unit: number;
  sell_total: number;
  cost_unit: number | null;
  cost_total: number | null;
  margin: number | null;
  margin_pct: number | null;
};

type Props = {
  open: boolean;
  rows: ProfitLineRow[];
  onClose: () => void;
};

export function QuotationProfitModal(props: Props) {
  const sellSum = () => props.rows.reduce((s, r) => s + r.sell_total, 0);
  const costSum = () =>
    props.rows.every((r) => r.cost_total != null)
      ? props.rows.reduce((s, r) => s + (r.cost_total ?? 0), 0)
      : null;
  const marginSum = () => {
    const c = costSum();
    return c == null ? null : sellSum() - c;
  };

  return (
    <EntityModal
      open={props.open}
      title="Calculate Profit"
      onClose={props.onClose}
      onSave={props.onClose}
      saveLabel="Close"
      wide
      stacked
      singleColumn
    >
      <p class="mb-3 text-sm text-text-secondary">
        Margin uses item purchase price when set (not a full costing engine). Lines without cost show “cost not set”.
      </p>
      <div class="overflow-x-auto rounded-lg border border-stroke">
        <table class="min-w-full text-sm">
          <thead class="bg-slate-50 text-left text-text-secondary">
            <tr>
              <th class="px-3 py-2">#</th>
              <th class="px-3 py-2">Item</th>
              <th class="px-3 py-2 text-right">Qty</th>
              <th class="px-3 py-2 text-right">Sell</th>
              <th class="px-3 py-2 text-right">Cost</th>
              <th class="px-3 py-2 text-right">Margin</th>
              <th class="px-3 py-2 text-right">%</th>
            </tr>
          </thead>
          <tbody>
            <For each={props.rows}>
              {(r) => (
                <tr class="border-t border-stroke">
                  <td class="px-3 py-2">{r.line_no}</td>
                  <td class="px-3 py-2">
                    <div class="font-medium text-text-primary">{r.item_code || "—"}</div>
                    <div class="text-xs text-text-secondary">{r.item_name}</div>
                  </td>
                  <td class="px-3 py-2 text-right">{r.qty}</td>
                  <td class="px-3 py-2 text-right">{formatMoney(r.sell_total)}</td>
                  <td class="px-3 py-2 text-right">
                    <Show when={r.cost_total != null} fallback={<span class="text-amber-700">cost not set</span>}>
                      {formatMoney(r.cost_total!)}
                    </Show>
                  </td>
                  <td class="px-3 py-2 text-right">
                    <Show when={r.margin != null} fallback="—">
                      {formatMoney(r.margin!)}
                    </Show>
                  </td>
                  <td class="px-3 py-2 text-right">
                    <Show when={r.margin_pct != null} fallback="—">
                      {r.margin_pct!.toFixed(1)}%
                    </Show>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
          <tfoot class="border-t border-stroke bg-slate-50 font-medium">
            <tr>
              <td class="px-3 py-2" colSpan={3}>
                Total
              </td>
              <td class="px-3 py-2 text-right">{formatMoney(sellSum())}</td>
              <td class="px-3 py-2 text-right">
                <Show when={costSum() != null} fallback="—">
                  {formatMoney(costSum()!)}
                </Show>
              </td>
              <td class="px-3 py-2 text-right">
                <Show when={marginSum() != null} fallback="—">
                  {formatMoney(marginSum()!)}
                </Show>
              </td>
              <td class="px-3 py-2 text-right">
                <Show when={marginSum() != null && sellSum() > 0} fallback="—">
                  {((marginSum()! / sellSum()) * 100).toFixed(1)}%
                </Show>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </EntityModal>
  );
}
