import { A } from "@solidjs/router";
import { For, Show, createMemo } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "../../../shared/api";
import { BiChart } from "../../../shared/charts/BiChart";
import { formatPeso } from "../../../shared/money";

export type InsightsTrendBucket = {
  label: string;
  from: string;
  to: string;
  revenue: number;
  cogs: number;
  gross_profit: number;
  operating_expenses: number;
  net_profit: number;
  cash: number;
  accounts_receivable: number;
  accounts_payable: number;
  gross_margin_pct?: number;
  net_margin_pct?: number;
  has_journal_data?: boolean;
};

type Trends = { interval: string; from: string; to: string; buckets: InsightsTrendBucket[] };

export type InsightsMonthChartProps = {
  dateFrom: string;
  dateTo: string;
  /** month | quarter | year */
  interval?: string;
  height?: number;
  /** Show link to full Financial Insights (Reports visibility). */
  showInsightsLink?: boolean;
  class?: string;
};

type RowDef = {
  label: string;
  pick: (b: InsightsTrendBucket) => number;
};

const FLOW_ROWS: RowDef[] = [
  { label: "Sales", pick: (b) => b.revenue ?? 0 },
  { label: "Cost of the goods", pick: (b) => b.cogs ?? 0 },
  { label: "Profit after the goods", pick: (b) => b.gross_profit ?? 0 },
  { label: "Shop costs", pick: (b) => b.operating_expenses ?? 0 },
  { label: "Profit after everything", pick: (b) => b.net_profit ?? 0 },
];

const BALANCE_ROWS: RowDef[] = [
  { label: "Cash", pick: (b) => b.cash ?? 0 },
  { label: "Money customers owe", pick: (b) => b.accounts_receivable ?? 0 },
  { label: "Money you owe", pick: (b) => b.accounts_payable ?? 0 },
];

function flowCell(b: InsightsTrendBucket, value: number) {
  if (!b.has_journal_data) return "—";
  return formatPeso(value);
}

function chartPoint(b: InsightsTrendBucket, value: number) {
  return b.has_journal_data ? value : Number.NaN;
}

function flowTotal(buckets: InsightsTrendBucket[], pick: RowDef["pick"]) {
  let sum = 0;
  let any = false;
  for (const b of buckets) {
    if (!b.has_journal_data) continue;
    any = true;
    sum += pick(b);
  }
  return any ? formatPeso(sum) : "—";
}

function balanceChange(buckets: InsightsTrendBucket[], index: number, pick: RowDef["pick"]) {
  if (index === 0) return "—";
  const cur = buckets[index];
  const prev = buckets[index - 1];
  if (!cur?.has_journal_data || !prev?.has_journal_data) return "—";
  return formatPeso(pick(cur) - pick(prev));
}

/** Books across the selected range: what happened each period, then what was left at the end. */
export function InsightsMonthChart(props: InsightsMonthChartProps) {
  const interval = () => props.interval || "month";

  const trends = createQuery(() => ({
    queryKey: ["finance-insights-trends", props.dateFrom, props.dateTo, interval()],
    queryFn: async () => {
      const qs = new URLSearchParams({
        date_from: props.dateFrom,
        date_to: props.dateTo,
        interval: interval(),
      });
      const res = await apiFetch<Trends>(`/api/v1/finance/insights/trends?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load trends");
      return res.data!;
    },
    staleTime: 60_000,
    get enabled() {
      return Boolean(props.dateFrom && props.dateTo);
    },
  }));

  const buckets = createMemo(() => trends.data?.buckets ?? []);
  const labels = createMemo(() => buckets().map((b) => b.label));
  const chartHeight = () => Math.min(props.height ?? 220, 220);

  const flowDatasets = createMemo(() =>
    FLOW_ROWS.map((row) => ({
      label: row.label,
      data: buckets().map((b) => chartPoint(b, row.pick(b))),
    })),
  );
  const balanceDatasets = createMemo(() =>
    BALANCE_ROWS.map((row) => ({
      label: row.label,
      data: buckets().map((b) => chartPoint(b, row.pick(b))),
    })),
  );

  return (
    <div class={`rounded-xl border border-stroke bg-white p-4 shadow-sm ${props.class ?? ""}`}>
      <div class="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 class="text-sm font-semibold text-text-primary">Books month by month</h2>
          <p class="mt-0.5 text-xs text-text-secondary">
            What happened in each period, then what was left at the end. A blank month has no posted books.
          </p>
        </div>
        <Show when={props.showInsightsLink}>
          <A href="/app/finance/acct-i/financial-insights" class="text-xs font-medium text-brand-700 hover:underline">
            Open Financial Insights →
          </A>
        </Show>
      </div>
      <Show when={trends.isLoading}>
        <p class="py-8 text-center text-sm text-text-secondary">Loading books trend…</p>
      </Show>
      <Show when={trends.isError}>
        <p class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {(trends.error as Error)?.message ?? "Could not load books trend."}
        </p>
      </Show>
      <Show when={!trends.isLoading && !trends.isError}>
        <Show when={buckets().length > 0} fallback={<p class="text-sm text-text-secondary">No trend points for this range.</p>}>
          <div class="space-y-6">
            <div>
              <h3 class="mb-2 text-sm font-medium text-text-primary">What happened</h3>
              <BiChart type="bar" labels={labels()} datasets={flowDatasets()} valueFormat="money" height={chartHeight()} legend />
              <div class="mt-3 overflow-x-auto">
                <table class="min-w-full text-left text-sm">
                  <thead class="text-xs uppercase text-text-secondary">
                    <tr>
                      <th class="px-2 py-1"> </th>
                      <For each={buckets()}>{(b) => <th class="px-2 py-1 text-right">{b.label}</th>}</For>
                      <th class="px-2 py-1 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={FLOW_ROWS}>
                      {(row) => (
                        <tr class="border-t border-stroke/70">
                          <th class="px-2 py-1.5 text-left font-medium text-text-primary">{row.label}</th>
                          <For each={buckets()}>
                            {(b) => <td class="px-2 py-1.5 text-right tabular-nums">{flowCell(b, row.pick(b))}</td>}
                          </For>
                          <td class="px-2 py-1.5 text-right tabular-nums font-medium">{flowTotal(buckets(), row.pick)}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <h3 class="mb-2 text-sm font-medium text-text-primary">What was left at the end</h3>
              <p class="mb-2 text-xs text-text-secondary">These are ending amounts. They are not added across the year.</p>
              <BiChart type="bar" labels={labels()} datasets={balanceDatasets()} valueFormat="money" height={chartHeight()} legend />
              <div class="mt-3 overflow-x-auto">
                <table class="min-w-full text-left text-sm">
                  <thead class="text-xs uppercase text-text-secondary">
                    <tr>
                      <th class="px-2 py-1"> </th>
                      <For each={buckets()}>{(b) => <th class="px-2 py-1 text-right">{b.label}</th>}</For>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={BALANCE_ROWS}>
                      {(row) => (
                        <tr class="border-t border-stroke/70">
                          <th class="px-2 py-1.5 text-left font-medium text-text-primary">
                            {row.label}
                            <span class="mt-0.5 block text-xs font-normal text-text-secondary">Change from the prior period</span>
                          </th>
                          <For each={buckets()}>
                            {(b, index) => (
                              <td class="px-2 py-1.5 text-right tabular-nums">
                                <div>{flowCell(b, row.pick(b))}</div>
                                <div class="text-xs text-text-secondary">{balanceChange(buckets(), index(), row.pick)}</div>
                              </td>
                            )}
                          </For>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Show>
      </Show>
    </div>
  );
}
