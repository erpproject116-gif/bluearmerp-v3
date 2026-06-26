import { For, Show } from "solid-js";
import type { SalesDiscountStatusRow } from "../../../shared/useSalesDiscountStatusReport";

type Props = {
  rows: SalesDiscountStatusRow[];
  metric?: "difference_amount" | "sales_amount" | "invoicing_amount";
};

function money(n: number) {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function SalesDiscountStatusGraph(props: Props) {
  const metric = () => props.metric ?? "difference_amount";

  const chartData = () => {
    const byCustomer = new Map<string, number>();
    for (const row of props.rows) {
      byCustomer.set(row.customer_name, (byCustomer.get(row.customer_name) ?? 0) + row[metric()]);
    }
    const entries = [...byCustomer.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 15);
    const max = Math.max(...entries.map((e) => e.value), 1);
    return { entries, max };
  };

  const metricLabel = () => {
    switch (metric()) {
      case "sales_amount": return "Sales Amount";
      case "invoicing_amount": return "Invoicing Amount";
      default: return "Difference Amount";
    }
  };

  return (
    <div class="rounded-lg border border-stroke bg-slate-50 p-4">
      <h3 class="mb-3 text-sm font-semibold text-text-primary">View as Graph — {metricLabel()} by Customer (top 15)</h3>
      <Show when={!props.rows.length}>
        <p class="text-sm text-text-secondary">No data to chart.</p>
      </Show>
      <Show when={props.rows.length}>
        <div class="space-y-2">
          <For each={chartData().entries}>
            {(entry) => (
              <div class="grid grid-cols-[minmax(8rem,12rem)_1fr_auto] items-center gap-3 text-sm">
                <span class="truncate text-text-primary" title={entry.label}>{entry.label}</span>
                <div class="h-5 rounded bg-white">
                  <div
                    class="h-full rounded bg-brand-500"
                    style={{ width: `${(entry.value / chartData().max) * 100}%` }}
                  />
                </div>
                <span class="tabular-nums text-text-secondary">{money(entry.value)}</span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
