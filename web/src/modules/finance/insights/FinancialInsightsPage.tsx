import { A, useSearchParams } from "@solidjs/router";
import { createQuery } from "@tanstack/solid-query";
import { For, Show, createMemo, createSignal } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { formatPeso } from "../../../shared/money";
import {
  queryParamFirst,
  reportsDateRangeFromQuery,
  type ReportDatePresetId,
} from "../../../shared/reports/ReportDatePresets";
import { defaultReportDateRange } from "../../../shared/reports/ReportPageLayout";
import { ReportDateRangePicker } from "../../../shared/reports/ReportDateRangePicker";
import { FinanceLayout } from "../FinanceLayout";

type MetricRow = {
  key: string;
  label: string;
  metric_type: string;
  preferred_direction: string;
  format: string;
  primary_kpi: boolean;
  current: number;
  previous: number;
  change: number;
  change_pct: number | null;
  change_pct_label?: string;
  change_pp?: number | null;
  direction: string;
  favorable?: boolean | null;
  ytd: number;
  prior_ytd: number;
  ytd_change: number;
  ytd_change_pct: number | null;
  ytd_change_pct_label?: string;
  href?: string;
};

type Overview = {
  current_from: string;
  current_to: string;
  compare_from: string;
  compare_to: string;
  comparison_type: string;
  ytd_from: string;
  ytd_to: string;
  prior_ytd_from: string;
  prior_ytd_to: string;
  has_journal_data: boolean;
  metrics: MetricRow[];
};

const COMPARISON_OPTIONS: { value: string; label: string }[] = [
  { value: "previous_month", label: "Previous month" },
  { value: "same_month_ly", label: "Same month last year" },
  { value: "previous_quarter", label: "Previous quarter" },
  { value: "same_quarter_ly", label: "Same quarter last year" },
  { value: "ytd_vs_prior_ytd", label: "YTD vs prior YTD" },
  { value: "previous_equivalent", label: "Previous equivalent period" },
  { value: "custom", label: "Custom period" },
];

function fmtMetric(row: MetricRow, value: number) {
  if (row.format === "percent") {
    return `${value.toFixed(1)}%`;
  }
  return formatPeso(value);
}

function fmtChange(row: MetricRow) {
  if (row.format === "percent" && row.change_pp != null) {
    const sign = row.change_pp > 0 ? "+" : "";
    return `${sign}${row.change_pp.toFixed(1)} pp`;
  }
  if (row.change_pct_label) return row.change_pct_label;
  if (row.change_pct == null) return "—";
  const sign = row.change_pct > 0 ? "+" : "";
  return `${sign}${row.change_pct.toFixed(1)}%`;
}

function tone(row: MetricRow) {
  if (row.favorable == null) return "text-text-secondary";
  return row.favorable ? "text-emerald-700" : "text-rose-700";
}

export default function FinancialInsightsPage() {
  const [params, setParams] = useSearchParams();
  const defaults = defaultReportDateRange();
  const range = createMemo(() => {
    const r = reportsDateRangeFromQuery(params);
    return {
      from: r.from || defaults.date_from,
      to: r.to || defaults.date_to,
      preset: r.preset,
    };
  });
  const comparison = createMemo(() => queryParamFirst(params.comparison) || "previous_month");
  const [compareFrom, setCompareFrom] = createSignal(queryParamFirst(params.compare_from) || "");
  const [compareTo, setCompareTo] = createSignal(queryParamFirst(params.compare_to) || "");

  const overview = createQuery(() => ({
    queryKey: [
      "finance-insights-overview",
      range().from,
      range().to,
      comparison(),
      compareFrom(),
      compareTo(),
    ],
    queryFn: async () => {
      const qs = new URLSearchParams({
        date_from: range().from,
        date_to: range().to,
        comparison: comparison(),
      });
      if (comparison() === "custom") {
        if (compareFrom()) qs.set("compare_from", compareFrom());
        if (compareTo()) qs.set("compare_to", compareTo());
      }
      const res = await apiFetch<Overview>(`/api/v1/finance/insights/overview?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load insights");
      return res.data!;
    },
    staleTime: 60_000,
  }));

  const applyRange = (preset: ReportDatePresetId, next: { date_from: string; date_to: string }) => {
    setParams(
      {
        filter_by: preset,
        from_date: next.date_from,
        to_date: next.date_to,
        date_from: next.date_from,
        date_to: next.date_to,
        comparison: comparison(),
      },
      { replace: true },
    );
  };

  const setComparison = (value: string) => {
    setParams({ ...params, comparison: value }, { replace: true });
  };

  const primary = createMemo(() => (overview.data?.metrics ?? []).filter((m) => m.primary_kpi));
  const tableRows = createMemo(() => overview.data?.metrics ?? []);

  return (
    <FinanceLayout>
      <div class="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-brand-700">General ledger</p>
            <h1 class="text-2xl font-semibold text-text-primary">Financial Insights</h1>
            <p class="mt-1 max-w-2xl text-sm text-text-secondary">
              Owner cockpit from <span class="font-medium text-text-primary">posted journals</span> — same truth as
              Profit &amp; Loss. Operational sales charts stay under Reports → Business intelligence.
            </p>
          </div>
          <A href="/app/reports#reports-bi" class="text-sm text-brand-700 hover:underline">
            Ops Business intelligence
          </A>
        </div>

        <div class="flex flex-wrap items-end gap-3 rounded-xl border border-stroke bg-white p-4 shadow-sm">
          <div>
            <span class="mb-1 block text-xs font-medium text-text-secondary">Period</span>
            <ReportDateRangePicker
              from={range().from}
              to={range().to}
              preset={range().preset}
              onApply={applyRange}
            />
          </div>
          <label class="block">
            <span class="mb-1 block text-xs font-medium text-text-secondary">Compare to</span>
            <select
              class="rounded-lg border border-stroke px-3 py-2 text-sm"
              value={comparison()}
              onChange={(e) => setComparison(e.currentTarget.value)}
            >
              <For each={COMPARISON_OPTIONS}>{(opt) => <option value={opt.value}>{opt.label}</option>}</For>
            </select>
          </label>
          <Show when={comparison() === "custom"}>
            <label class="block">
              <span class="mb-1 block text-xs font-medium text-text-secondary">Compare from</span>
              <input
                type="date"
                class="rounded-lg border border-stroke px-3 py-2 text-sm"
                value={compareFrom()}
                onInput={(e) => {
                  setCompareFrom(e.currentTarget.value);
                  setParams({ ...params, compare_from: e.currentTarget.value }, { replace: true });
                }}
              />
            </label>
            <label class="block">
              <span class="mb-1 block text-xs font-medium text-text-secondary">Compare to</span>
              <input
                type="date"
                class="rounded-lg border border-stroke px-3 py-2 text-sm"
                value={compareTo()}
                onInput={(e) => {
                  setCompareTo(e.currentTarget.value);
                  setParams({ ...params, compare_to: e.currentTarget.value }, { replace: true });
                }}
              />
            </label>
          </Show>
        </div>

        <Show when={overview.isError}>
          <p class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {(overview.error as Error)?.message ?? "Could not load insights."}
          </p>
        </Show>
        <Show when={overview.isLoading}>
          <p class="text-sm text-text-secondary">Loading financial insights…</p>
        </Show>

        <Show when={overview.data}>
          {(d) => (
            <>
              <p class="text-xs text-text-secondary">
                Current {d().current_from} → {d().current_to}
                {" · "}
                vs {d().compare_from} → {d().compare_to}
                {" · "}
                YTD {d().ytd_from} → {d().ytd_to}
              </p>

              <Show when={!d().has_journal_data}>
                <p class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  No posted journal activity in these windows yet.{" "}
                  <A href="/app/finance/acct-i/journal-entries" class="font-medium underline">
                    Open journal entries
                  </A>
                </p>
              </Show>

              <section class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <For each={primary()}>
                  {(row) => (
                    <A
                      href={row.href || "/app/finance/acct-i/reports/profit-and-loss"}
                      class="block rounded-xl border border-stroke bg-white p-4 shadow-sm transition hover:border-brand-300"
                    >
                      <div class="text-xs font-semibold uppercase tracking-wide text-text-secondary">{row.label}</div>
                      <div class="mt-2 text-xl font-bold text-text-primary">{fmtMetric(row, row.current)}</div>
                      <div class={`mt-1 text-sm ${tone(row)}`}>
                        {row.direction === "up" ? "↑" : row.direction === "down" ? "↓" : "→"}{" "}
                        {fmtMetric(row, row.change)} ({fmtChange(row)})
                      </div>
                      <div class="mt-1 text-xs text-text-secondary">
                        Prior: {fmtMetric(row, row.previous)}
                      </div>
                    </A>
                  )}
                </For>
              </section>

              <section class="overflow-x-auto rounded-xl border border-stroke bg-white shadow-sm">
                <div class="border-b border-stroke px-4 py-3">
                  <h2 class="text-sm font-semibold text-text-primary">Period comparison</h2>
                </div>
                <table class="min-w-full text-left text-sm">
                  <thead class="bg-slate-50 text-xs uppercase text-text-secondary">
                    <tr>
                      <th class="px-3 py-2">Metric</th>
                      <th class="px-3 py-2 text-right">Current</th>
                      <th class="px-3 py-2 text-right">Previous</th>
                      <th class="px-3 py-2 text-right">Change</th>
                      <th class="px-3 py-2 text-right">Change %</th>
                      <th class="px-3 py-2 text-right">YTD</th>
                      <th class="px-3 py-2 text-right">Prior YTD</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={tableRows()}>
                      {(row) => (
                        <tr class="border-t border-stroke/70">
                          <td class="px-3 py-2 font-medium text-text-primary">{row.label}</td>
                          <td class="px-3 py-2 text-right tabular-nums">{fmtMetric(row, row.current)}</td>
                          <td class="px-3 py-2 text-right tabular-nums text-text-secondary">
                            {fmtMetric(row, row.previous)}
                          </td>
                          <td class={`px-3 py-2 text-right tabular-nums ${tone(row)}`}>
                            {fmtMetric(row, row.change)}
                          </td>
                          <td class={`px-3 py-2 text-right tabular-nums ${tone(row)}`}>{fmtChange(row)}</td>
                          <td class="px-3 py-2 text-right tabular-nums">{fmtMetric(row, row.ytd)}</td>
                          <td class="px-3 py-2 text-right tabular-nums text-text-secondary">
                            {fmtMetric(row, row.prior_ytd)}
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </section>

              <p class="text-xs text-text-secondary">
                Drill: open{" "}
                <A
                  href={`/app/finance/acct-i/reports/profit-and-loss?date_from=${d().current_from}&date_to=${d().current_to}`}
                  class="text-brand-700 hover:underline"
                >
                  Profit &amp; Loss
                </A>
                {" · "}
                <A href="/app/finance/acct-i/reports/balance-sheet" class="text-brand-700 hover:underline">
                  Balance sheet
                </A>
                {" · "}
                <A href="/app/finance/acct-i/reports/general-ledger" class="text-brand-700 hover:underline">
                  General ledger
                </A>
              </p>
            </>
          )}
        </Show>
      </div>
    </FinanceLayout>
  );
}
