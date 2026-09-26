import { A, useSearchParams } from "@solidjs/router";
import { createQuery } from "@tanstack/solid-query";
import { For, Show, createMemo, createSignal } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { BiChart } from "../../../shared/charts/BiChart";
import { formatPeso } from "../../../shared/money";
import {
  queryParamFirst,
  reportsDateRangeFromQuery,
  type ReportDatePresetId,
} from "../../../shared/reports/ReportDatePresets";
import { defaultReportDateRange } from "../../../shared/reports/ReportPageLayout";
import { ReportDateRangePicker } from "../../../shared/reports/ReportDateRangePicker";
import { FinanceLayout } from "../FinanceLayout";
import { InsightsMonthChart } from "./InsightsMonthChart";

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

type KeyChange = {
  key: string;
  label: string;
  direction: string;
  change: number;
  change_pct?: number | null;
  change_pp?: number | null;
  change_label: string;
  favorable?: boolean | null;
  material: boolean;
};

type DataQuality = {
  draft_journal_entries: number;
  confirmed_sales_draft_or_missing_je: number;
  confirmed_bills_draft_or_missing_je: number;
  incomplete: boolean;
  message?: string;
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
  key_changes: KeyChange[];
  reading?: string;
  data_quality: DataQuality;
};

const PLAIN_METRIC_LABEL: Record<string, string> = {
  revenue: "Sales",
  cogs: "Cost of the goods",
  gross_profit: "Profit after the goods",
  operating_expenses: "Shop costs",
  net_profit: "Profit after everything",
  cash: "Cash",
  accounts_receivable: "Money customers owe",
  accounts_payable: "Money you owe",
};

function plainMetricLabel(key: string, fallback: string) {
  return PLAIN_METRIC_LABEL[key] || fallback;
}

type TrendBucket = {
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
  gross_margin_pct: number;
  net_margin_pct: number;
  cogs?: number;
  has_journal_data?: boolean;
};

type Trends = { interval: string; from: string; to: string; buckets: TrendBucket[] };

type Contributor = {
  account_id: number;
  account_code: string;
  account_name: string;
  account_type: string;
  current: number;
  previous: number;
  change: number;
  href: string;
};

type Contributors = {
  metric_key: string;
  rows: Contributor[];
  explanation?: string;
  href?: string;
  href_label?: string;
};

type OverdueInvoice = {
  sales_no: string;
  customer_name: string;
  balance: number;
  due_date: string;
};

type FinancialHealthSnap = {
  overdue_alerts?: OverdueInvoice[];
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

const WHY_METRICS: { value: string; label: string }[] = [
  { value: "revenue", label: "Sales" },
  { value: "cogs", label: "Cost of the goods" },
  { value: "operating_expenses", label: "Shop costs" },
  { value: "net_profit", label: "Profit after everything" },
  { value: "accounts_receivable", label: "Money customers owe" },
  { value: "accounts_payable", label: "Money you owe" },
  { value: "cash", label: "Cash" },
];

function fmtMetric(row: { format: string }, value: number) {
  if (row.format === "percent") return `${value.toFixed(1)}%`;
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

function tone(fav: boolean | null | undefined) {
  if (fav == null) return "text-text-secondary";
  return fav ? "text-emerald-700" : "text-rose-700";
}

const BAIKO_WHY_PREFIX = "baiko-insights-why:";

function metricSlice(metrics: MetricRow[] | undefined, key: string) {
  return metrics?.find((m) => m.key === key);
}

function whyLineFingerprint(ov: Overview, metric: string, overdue: OverdueInvoice[] | undefined) {
  const row = metricSlice(ov.metrics, metric);
  const parts = [
    ov.current_from,
    ov.current_to,
    ov.compare_from,
    ov.compare_to,
    metric,
    String(row?.current ?? ""),
    String(row?.previous ?? ""),
    String(row?.change ?? ""),
  ];
  if (ov.data_quality?.incomplete) parts.push(ov.data_quality.message ?? "incomplete");
  if (metric === "cogs" || metric === "gross_profit" || metric === "net_profit") {
    const shop = metricSlice(ov.metrics, "operating_expenses");
    const otherKey = metric === "net_profit" ? "gross_profit" : "net_profit";
    const other = metricSlice(ov.metrics, otherKey);
    parts.push(String(shop?.current ?? ""), String(shop?.change ?? ""), String(other?.current ?? ""), String(other?.change ?? ""));
  }
  if (metric === "accounts_receivable") {
    const cash = metricSlice(ov.metrics, "cash");
    parts.push(String(cash?.change ?? ""));
    const names = (overdue ?? [])
      .map((a) => `${a.customer_name}|${a.sales_no}|${a.balance}|${a.due_date}`)
      .sort()
      .join(",");
    parts.push(names);
  }
  return parts.join("|");
}

function readWhyCache(key: string) {
  if (!key) return null;
  try {
    const raw = sessionStorage.getItem(BAIKO_WHY_PREFIX + key);
    if (!raw || /audited/i.test(raw)) return null;
    return plainBaikoSentences(raw);
  } catch {
    return null;
  }
}

function writeWhyCache(key: string, text: string) {
  try {
    sessionStorage.setItem(BAIKO_WHY_PREFIX + key, text);
  } catch {
    /* private mode */
  }
}

function plainBaikoSentences(msg: string) {
  return msg
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
  const interval = createMemo(() => queryParamFirst(params.interval) || "month");
  const whyMetric = createMemo(() => queryParamFirst(params.why_metric) || "revenue");
  const [askedMetric, setAskedMetric] = createSignal<string | null>(null);
  const [compareFrom, setCompareFrom] = createSignal(queryParamFirst(params.compare_from) || "");
  const [compareTo, setCompareTo] = createSignal(queryParamFirst(params.compare_to) || "");

  const overviewQs = createMemo(() => {
    const qs = new URLSearchParams({
      date_from: range().from,
      date_to: range().to,
      comparison: comparison(),
    });
    if (comparison() === "custom") {
      if (compareFrom()) qs.set("compare_from", compareFrom());
      if (compareTo()) qs.set("compare_to", compareTo());
    }
    return qs;
  });

  const overview = createQuery(() => ({
    queryKey: ["finance-insights-overview", overviewQs().toString()],
    queryFn: async () => {
      const res = await apiFetch<Overview>(`/api/v1/finance/insights/overview?${overviewQs()}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load insights");
      return res.data!;
    },
    staleTime: 60_000,
  }));

  const trends = createQuery(() => ({
    queryKey: ["finance-insights-trends", range().from, range().to, interval()],
    queryFn: async () => {
      const qs = new URLSearchParams({
        date_from: range().from,
        date_to: range().to,
        interval: interval(),
      });
      const res = await apiFetch<Trends>(`/api/v1/finance/insights/trends?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load trends");
      return res.data!;
    },
    staleTime: 60_000,
  }));

  const contributors = createQuery(() => ({
    queryKey: ["finance-insights-contributors", overviewQs().toString(), whyMetric()],
    queryFn: async () => {
      const qs = new URLSearchParams(overviewQs());
      qs.set("metric", whyMetric());
      const res = await apiFetch<Contributors>(`/api/v1/finance/insights/contributors?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load contributors");
      return res.data!;
    },
    staleTime: 60_000,
  }));

  const overdueCustomers = createQuery(() => ({
    queryKey: ["finance-insights-overdue-customers"],
    enabled: whyMetric() === "accounts_receivable",
    queryFn: async () => {
      const res = await apiFetch<FinancialHealthSnap>("/api/v1/dashboard/financial-health", {}, { silent: true });
      if (!res.success || !res.data) return { overdue_alerts: [] as OverdueInvoice[] };
      return res.data;
    },
    retry: false,
    staleTime: 60_000,
  }));

  const whyKey = createMemo(() => {
    const ov = overview.data;
    if (!ov) return "";
    return whyLineFingerprint(ov, whyMetric(), overdueCustomers.data?.overdue_alerts);
  });
  const cachedWhy = createMemo(() => readWhyCache(whyKey()));
  const arReady = createMemo(
    () => whyMetric() !== "accounts_receivable" || overdueCustomers.isFetched || overdueCustomers.isError,
  );

  const baikoWhy = createQuery(() => {
    const key = whyKey();
    const asked = askedMetric() === whyMetric();
    return {
      queryKey: ["finance-insights-baiko-line", key],
      enabled: Boolean(key) && asked && arReady() && !readWhyCache(key),
      retry: false,
      staleTime: Infinity,
      queryFn: async () => {
        const ov = overview.data;
        const metric = whyMetric();
        if (!ov || whyLineFingerprint(ov, metric, overdueCustomers.data?.overdue_alerts) !== key) return null;
        const row = metricSlice(ov.metrics, metric);
        const facts: Record<string, unknown> = {
          metric,
          label: plainMetricLabel(metric, row?.label ?? ""),
          current_from: ov.current_from,
          current_to: ov.current_to,
          compare_from: ov.compare_from,
          compare_to: ov.compare_to,
          current: row?.current ?? 0,
          previous: row?.previous ?? 0,
          change: row?.change ?? 0,
          change_pct_label: row?.change_pct_label ?? "",
        };
        if (ov.data_quality?.incomplete && ov.data_quality.message) {
          facts.data_quality_warning = ov.data_quality.message;
        }
        if (metric === "cogs" || metric === "gross_profit" || metric === "net_profit") {
          const shop = metricSlice(ov.metrics, "operating_expenses");
          const other = metricSlice(ov.metrics, metric === "net_profit" ? "gross_profit" : "net_profit");
          facts.shop_costs_current = shop?.current ?? 0;
          facts.shop_costs_change = shop?.change ?? 0;
          facts.other_profit_current = other?.current ?? 0;
          facts.other_profit_change = other?.change ?? 0;
        }
        if (metric === "accounts_receivable") {
          const cash = metricSlice(ov.metrics, "cash");
          facts.cash_change = cash?.change ?? 0;
          facts.overdue_names = (overdueCustomers.data?.overdue_alerts ?? []).map((a) => ({
            customer_name: a.customer_name,
            sales_no: a.sales_no,
            balance: a.balance,
            due_date: a.due_date,
          }));
        }
        const res = await apiFetch<{ message?: string; used_ai?: boolean }>(
          "/api/v1/copilot/ask",
          {
            method: "POST",
            body: JSON.stringify({
              query: "Explain this one line in plain sentences. Use only these figures. Do not add a heading.",
              pathname: "/app/finance/acct-i/financial-insights",
              page_facts: facts,
            }),
          },
          { silent: true },
        );
        const msg = plainBaikoSentences(res.data?.message ?? "");
        if (!res.success || !res.data?.used_ai || !msg || /audited/i.test(msg)) return null;
        if (whyLineFingerprint(ov, metric, overdueCustomers.data?.overdue_alerts) !== key) return null;
        writeWhyCache(key, msg);
        return msg;
      },
    };
  });

  const baikoParagraph = createMemo(() => cachedWhy() || (askedMetric() === whyMetric() ? baikoWhy.data ?? "" : ""));

  const openWhy = (key: string) => {
    const metric = key === "gross_profit" ? "cogs" : key;
    setAskedMetric(metric);
    setParams({ ...params, why_metric: metric }, { replace: true });
  };

  const applyRange = (preset: ReportDatePresetId, next: { date_from: string; date_to: string }) => {
    setParams(
      {
        filter_by: preset,
        from_date: next.date_from,
        to_date: next.date_to,
        date_from: next.date_from,
        date_to: next.date_to,
        comparison: comparison(),
        interval: interval(),
        why_metric: whyMetric(),
      },
      { replace: true },
    );
  };

  const primary = createMemo(() => (overview.data?.metrics ?? []).filter((m) => m.primary_kpi));
  const tableRows = createMemo(() => overview.data?.metrics ?? []);
  const trendLabels = createMemo(() => (trends.data?.buckets ?? []).map((b) => b.label));
  const marginDatasets = createMemo(() => [
    { label: "Gross Margin %", data: (trends.data?.buckets ?? []).map((b) => b.gross_margin_pct) },
    { label: "Net Margin %", data: (trends.data?.buckets ?? []).map((b) => b.net_margin_pct) },
  ]);

  return (
    <FinanceLayout>
      <div class="w-full space-y-6">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-brand-700">General ledger</p>
            <h1 class="text-2xl font-semibold text-text-primary">Financial Insights</h1>
            <p class="mt-1 max-w-2xl text-sm text-text-secondary">
              Owner cockpit from <span class="font-medium text-text-primary">posted journals</span> — same truth as
              Profit &amp; Loss. Operational sales stay under Reports → Business intelligence.
            </p>
          </div>
          <A href="/app/reports#reports-bi" class="text-sm text-brand-700 hover:underline">
            Ops Business intelligence
          </A>
        </div>

        <div class="flex flex-wrap items-end gap-3 rounded-xl border border-stroke bg-white p-4 shadow-sm">
          <div>
            <span class="mb-1 block text-xs font-medium text-text-secondary">Period</span>
            <ReportDateRangePicker from={range().from} to={range().to} preset={range().preset} onApply={applyRange} />
          </div>
          <label class="block">
            <span class="mb-1 block text-xs font-medium text-text-secondary">Compare to</span>
            <select
              class="rounded-lg border border-stroke px-3 py-2 text-sm"
              value={comparison()}
              onChange={(e) => setParams({ ...params, comparison: e.currentTarget.value }, { replace: true })}
            >
              <For each={COMPARISON_OPTIONS}>{(opt) => <option value={opt.value}>{opt.label}</option>}</For>
            </select>
          </label>
          <label class="block">
            <span class="mb-1 block text-xs font-medium text-text-secondary">Trend interval</span>
            <select
              class="rounded-lg border border-stroke px-3 py-2 text-sm"
              value={interval()}
              onChange={(e) => setParams({ ...params, interval: e.currentTarget.value }, { replace: true })}
            >
              <option value="month">Monthly</option>
              <option value="quarter">Quarterly</option>
              <option value="year">Yearly</option>
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
              <Show when={d().data_quality?.incomplete}>
                <p class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {d().data_quality.message}{" "}
                  <A href={d().data_quality.href || "/app/finance/bookkeeping"} class="font-medium underline">
                    Open Bookkeeping
                  </A>
                </p>
              </Show>

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
                      <div class={`mt-1 text-sm ${tone(row.favorable)}`}>
                        {row.direction === "up" ? "↑" : row.direction === "down" ? "↓" : "→"}{" "}
                        {fmtMetric(row, row.change)} ({fmtChange(row)})
                      </div>
                      <div class="mt-1 text-xs text-text-secondary">Prior: {fmtMetric(row, row.previous)}</div>
                    </A>
                  )}
                </For>
              </section>

              <section class="space-y-4">
                <InsightsMonthChart dateFrom={range().from} dateTo={range().to} interval={interval()} height={280} />
                <div class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
                  <h2 class="mb-3 text-sm font-semibold text-text-primary">Margins %</h2>
                  <Show when={(trends.data?.buckets?.length ?? 0) > 0} fallback={<p class="text-sm text-text-secondary">No margin points.</p>}>
                    <BiChart type="bar" labels={trendLabels()} datasets={marginDatasets()} height={240} legend />
                  </Show>
                </div>
              </section>

              <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
                <h2 class="mb-3 text-sm font-semibold text-text-primary">Key changes</h2>
                <Show when={!!d().reading}>
                  <p class="mb-3 text-sm text-text-secondary">{d().reading}</p>
                </Show>
                <Show when={(d().key_changes?.length ?? 0) > 0} fallback={<p class="text-sm text-text-secondary">No material movements in this comparison.</p>}>
                  <ul class="space-y-2">
                    <For each={d().key_changes ?? []}>
                      {(kc) => (
                        <li class="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span class="font-medium text-text-primary">
                            {plainMetricLabel(kc.key, kc.label)}{" "}
                            <span class={tone(kc.favorable)}>
                              {kc.direction === "up" ? "↑" : kc.direction === "down" ? "↓" : "→"} {formatPeso(kc.change)}
                              <Show when={kc.change_label === "New"}>
                                <span class="ml-1 font-normal text-text-secondary">(started from about zero)</span>
                              </Show>
                              <Show when={!!kc.change_label && kc.change_label !== "New" && kc.change_label !== "N/A"}>
                                <span class="ml-1 font-normal">({kc.change_label})</span>
                              </Show>
                            </span>
                            <Show when={kc.material && !(d().key_changes ?? []).every((row) => row.material)}>
                              <span class="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-900">
                                Material
                              </span>
                            </Show>
                          </span>
                          <button
                            type="button"
                            class="text-xs font-medium text-brand-700 hover:underline"
                            onClick={() => openWhy(kc.key)}
                          >
                            Why did this change?
                          </button>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </section>

              <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
                <div class="mb-3 flex flex-wrap items-end justify-between gap-2">
                  <h2 class="text-sm font-semibold text-text-primary">Why did this change?</h2>
                  <select
                    class="rounded-lg border border-stroke px-3 py-1.5 text-sm"
                    value={whyMetric()}
                    onChange={(e) => openWhy(e.currentTarget.value)}
                  >
                    <For each={WHY_METRICS}>{(m) => <option value={m.value}>{m.label}</option>}</For>
                  </select>
                </div>
                <Show when={contributors.isLoading}>
                  <p class="text-sm text-text-secondary">Loading…</p>
                </Show>
                <Show when={!contributors.isLoading && (contributors.data?.rows?.length ?? 0) > 0}>
                  <ul class="divide-y divide-stroke/70">
                    <For each={contributors.data?.rows ?? []}>
                      {(row) => (
                        <li class="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                          <div>
                            <A href={row.href} class="font-medium text-brand-700 hover:underline">
                              {row.account_code} · {row.account_name}
                            </A>
                            <p class="text-xs text-text-secondary">
                              {formatPeso(row.previous)} → {formatPeso(row.current)}
                            </p>
                          </div>
                          <span class={`tabular-nums font-semibold ${row.change >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                            {row.change >= 0 ? "+" : ""}
                            {formatPeso(row.change)}
                          </span>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
                <Show when={!contributors.isLoading && (contributors.data?.rows?.length ?? 0) === 0}>
                  <p class="text-sm text-text-secondary">
                    {contributors.data?.explanation || "No single account explains this change. The movement is in the total."}
                  </p>
                  <Show when={!!contributors.data?.href}>
                    <A href={contributors.data?.href || "#"} class="mt-2 inline-block text-sm font-medium text-brand-700 hover:underline">
                      {contributors.data?.href_label || "Open the report"}
                    </A>
                  </Show>
                </Show>
                <Show when={!!baikoParagraph()}>
                  <p class="mt-3 text-sm text-text-secondary">{baikoParagraph()}</p>
                </Show>
                <Show when={whyMetric() === "accounts_receivable" && (overdueCustomers.data?.overdue_alerts?.length ?? 0) > 0}>
                  <p class="mb-2 mt-4 text-sm font-medium text-text-primary">Who still owes you</p>
                  <ul class="space-y-1 text-sm">
                    <For each={overdueCustomers.data?.overdue_alerts ?? []}>
                      {(row) => (
                        <li class="flex flex-wrap justify-between gap-2">
                          <span>
                            {row.customer_name || "Customer"} · {row.sales_no}
                            <Show when={!!row.due_date}>
                              <span class="text-text-secondary"> · due {row.due_date}</span>
                            </Show>
                          </span>
                          <span class="tabular-nums">{formatPeso(row.balance)}</span>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
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
                          <td class="px-3 py-2 font-medium text-text-primary">
                            <A href={row.href || "#"} class="hover:underline">
                              {row.label}
                            </A>
                          </td>
                          <td class="px-3 py-2 text-right tabular-nums">{fmtMetric(row, row.current)}</td>
                          <td class="px-3 py-2 text-right tabular-nums text-text-secondary">{fmtMetric(row, row.previous)}</td>
                          <td class={`px-3 py-2 text-right tabular-nums ${tone(row.favorable)}`}>{fmtMetric(row, row.change)}</td>
                          <td class={`px-3 py-2 text-right tabular-nums ${tone(row.favorable)}`}>{fmtChange(row)}</td>
                          <td class="px-3 py-2 text-right tabular-nums">{fmtMetric(row, row.ytd)}</td>
                          <td class="px-3 py-2 text-right tabular-nums text-text-secondary">{fmtMetric(row, row.prior_ytd)}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </section>

              <p class="text-xs text-text-secondary">
                Drill:{" "}
                <A
                  href={`/app/finance/acct-i/reports/profit-and-loss?date_from=${d().current_from}&date_to=${d().current_to}`}
                  class="text-brand-700 hover:underline"
                >
                  Profit &amp; Loss
                </A>
                {" · "}
                <A
                  href={`/app/finance/acct-i/reports/general-ledger?date_from=${d().current_from}&date_to=${d().current_to}`}
                  class="text-brand-700 hover:underline"
                >
                  General ledger
                </A>
                {" · "}
                <A href="/app/finance/acct-i/journal-entries" class="text-brand-700 hover:underline">
                  Journal entries
                </A>
                {" · "}
                <A href="/app/finance/bookkeeping" class="text-brand-700 hover:underline">
                  Books health
                </A>
              </p>
            </>
          )}
        </Show>
      </div>
    </FinanceLayout>
  );
}
