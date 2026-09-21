import { A } from "@solidjs/router";
import { Show, createMemo } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "../../../shared/api";
import { BiChart } from "../../../shared/charts/BiChart";

export type InsightsTrendBucket = {
  label: string;
  from: string;
  to: string;
  revenue: number;
  gross_profit: number;
  operating_expenses: number;
  net_profit: number;
  cash: number;
  accounts_receivable: number;
  accounts_payable: number;
  gross_margin_pct?: number;
  net_margin_pct?: number;
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

/** Shared books month-by-month chart: primary KPI flows + Cash / AR / AP ending balances. */
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

  const labels = createMemo(() => (trends.data?.buckets ?? []).map((b) => b.label));
  const datasets = createMemo(() => {
    const buckets = trends.data?.buckets ?? [];
    return [
      { label: "Revenue", data: buckets.map((b) => b.revenue ?? 0) },
      { label: "Gross Profit", data: buckets.map((b) => b.gross_profit ?? 0) },
      { label: "Operating Expenses", data: buckets.map((b) => b.operating_expenses ?? 0) },
      { label: "Net Profit", data: buckets.map((b) => b.net_profit ?? 0) },
      { label: "Cash", data: buckets.map((b) => b.cash ?? 0) },
      { label: "Accounts Receivable", data: buckets.map((b) => b.accounts_receivable ?? 0) },
      { label: "Accounts Payable", data: buckets.map((b) => b.accounts_payable ?? 0) },
    ];
  });

  return (
    <div class={`rounded-xl border border-stroke bg-white p-4 shadow-sm ${props.class ?? ""}`}>
      <div class="mb-1 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 class="text-sm font-semibold text-text-primary">Books month by month</h2>
          <p class="mt-0.5 text-xs text-text-secondary">
            Flows for each period; Cash / AR / AP are ending balances.
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
        <Show when={(trends.data?.buckets?.length ?? 0) > 0} fallback={<p class="text-sm text-text-secondary">No trend points for this range.</p>}>
          <BiChart type="bar" labels={labels()} datasets={datasets()} valueFormat="money" height={props.height ?? 280} legend />
        </Show>
      </Show>
    </div>
  );
}
