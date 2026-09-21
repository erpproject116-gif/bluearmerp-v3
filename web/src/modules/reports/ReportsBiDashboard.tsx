import { A, useSearchParams } from "@solidjs/router";
import { For, Show, createMemo } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { formatPeso } from "../../shared/money";
import {
  reportsDateRangeFromQuery,
  withReportDateQuery,
  type ReportDatePresetId,
} from "../../shared/reports/ReportDatePresets";
import { ReportDateRangePicker } from "../../shared/reports/ReportDateRangePicker";
import { OpsIntelligencePanel } from "../dashboard/OpsIntelligencePanel";

type NamedAmount = {
  label: string;
  amount: number;
  count?: number;
  href?: string;
};

type PeriodSummary = {
  period: "weekly" | "monthly" | string;
  as_of: string;
  window_label: string;
  lookback_days: number;
  company_name?: string;
  sales_mtd: number;
  sales_ytd: number;
  sales_in_window: number;
  cash_inflow_mtd: number;
  cash_outflow_mtd: number;
  cash_net_mtd: number;
  cash_inflow_ytd: number;
  cash_outflow_ytd: number;
  cash_net_ytd: number;
  ar_total: number;
  ar_overdue: number;
  ap_total: number;
  ap_overdue: number;
  overdue_ar_count: number;
  pending_so: number;
  pending_po: number;
  pending_pr: number;
  quotes_expiring_7d: number;
  low_stock_count: number;
  zero_stock_count: number;
  red_flag_total: number;
  red_flags: NamedAmount[];
  top_customers: NamedAmount[];
  top_items: NamedAmount[];
  profit_products: NamedAmount[];
  recurring_burn_monthly: number;
  pnl_income: number;
  pnl_expense: number;
  pnl_net: number;
  has_journal_pnl: boolean;
  overdue_alerts: NamedAmount[];
};

function int(n: number | undefined) {
  return (n ?? 0).toLocaleString("en-PH", { maximumFractionDigits: 0 });
}

function Kpi(props: { label: string; value: string; href?: string; warn?: boolean }) {
  const body = (
    <div
      class={`rounded-xl border border-stroke bg-white p-4 shadow-sm ${props.warn ? "border-amber-300" : ""}`}
    >
      <div class="text-xs font-semibold uppercase tracking-wide text-text-secondary">{props.label}</div>
      <div class={`mt-2 text-xl font-bold ${props.warn ? "text-amber-700" : "text-brand-600"}`}>{props.value}</div>
    </div>
  );
  return props.href ? (
    <A href={props.href} class="block transition hover:opacity-90">
      {body}
    </A>
  ) : (
    body
  );
}

/** Period KPIs + ops intelligence charts — shown at the top of /app/reports. */
export function ReportsBiDashboard(props: { opsVariant?: "full" | "period" }) {
  const [params, setParams] = useSearchParams();
  const opsVariant = () => props.opsVariant ?? "full";

  const range = createMemo(() => reportsDateRangeFromQuery(params));

  const q = createQuery(() => ({
    queryKey: ["dashboard-period-summary", range().from, range().to],
    queryFn: async () => {
      const qs = new URLSearchParams({
        period: "monthly",
        date_from: range().from,
        date_to: range().to,
      });
      const res = await apiFetch<PeriodSummary>(`/api/v1/dashboard/period-summary?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load period summary");
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
      },
      { replace: true },
    );
  };

  return (
    <div class="space-y-6">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-brand-700">Dashboard &amp; charts</p>
          <h2 class="text-xl font-bold text-text-primary">Business intelligence</h2>
          <p class="mt-1 text-sm text-text-secondary">
            Operational snapshot (booked sales, pipeline, stock). Accounting Revenue / Net Profit live under{" "}
            <A href="/app/finance/acct-i/financial-insights" class="font-medium text-brand-700 hover:underline">
              Financial Insights
            </A>
            .
          </p>
          <Show when={q.data}>
            {(d) => (
              <p class="mt-1 text-sm text-text-secondary">
                {d().window_label} · as of {d().as_of}
                <Show when={d().company_name}> · {d().company_name}</Show>
              </p>
            )}
          </Show>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm text-text-secondary">Filters :</span>
          <ReportDateRangePicker
            from={range().from}
            to={range().to}
            preset={range().preset}
            onApply={applyRange}
          />
          <A href="/app/dashboard" class="rounded-lg border border-stroke bg-white px-3 py-1.5 text-sm font-semibold text-text-primary hover:bg-slate-50">
            Home
          </A>
        </div>
      </div>

      <Show when={q.isError}>
        <p class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {(q.error as Error)?.message ?? "Could not load period summary."}
        </p>
      </Show>
      <Show when={q.isLoading}>
        <p class="text-sm text-text-secondary">Loading dashboard charts…</p>
      </Show>

      <Show when={q.data}>
        {(d) => (
          <>
            <section class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi label="Booked sales (window)" value={formatPeso(d().sales_in_window)} href="/app/sales/sales" />
              <Kpi label="Booked sales MTD" value={formatPeso(d().sales_mtd)} href="/app/sales/sales" />
              <Kpi label="Booked sales YTD" value={formatPeso(d().sales_ytd)} href="/app/sales/sales" />
              <Kpi label="Cash net YTD (ops)" value={formatPeso(d().cash_net_ytd)} href="/app/finance/collections" />
              <Kpi
                label="Cash in / out MTD (ops)"
                value={`${formatPeso(d().cash_inflow_mtd)} / ${formatPeso(d().cash_outflow_mtd)}`}
                href="/app/finance/disbursements"
              />
            </section>

            <section class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi
                label="AR total / overdue"
                value={`${formatPeso(d().ar_total)} / ${formatPeso(d().ar_overdue)}`}
                href="/app/finance/reports/ar-aging"
                warn={(d().ar_overdue ?? 0) > 0}
              />
              <Kpi
                label="AP total / overdue"
                value={`${formatPeso(d().ap_total)} / ${formatPeso(d().ap_overdue)}`}
                href="/app/finance/reports/ap-aging"
                warn={(d().ap_overdue ?? 0) > 0}
              />
              <Kpi
                label="Pending SO / PO / PR"
                value={`${int(d().pending_so)} / ${int(d().pending_po)} / ${int(d().pending_pr)}`}
                href="/app/sales-order/sales-orders"
              />
              <Kpi
                label="Low / zero stock"
                value={`${int(d().low_stock_count)} / ${int(d().zero_stock_count)}`}
                href="/app/inventory/find-stock"
                warn={(d().low_stock_count ?? 0) + (d().zero_stock_count ?? 0) > 0}
              />
            </section>

            <section>
              <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 class="text-sm font-semibold text-text-primary">Posted P&amp;L (window)</h3>
                <div class="flex flex-wrap gap-3 text-xs">
                  <A
                    href={withReportDateQuery(
                      "/app/finance/acct-i/financial-insights",
                      range().from,
                      range().to,
                    )}
                    class="font-medium text-brand-700 hover:underline"
                  >
                    Financial Insights (compare periods)
                  </A>
                  <A
                    href={withReportDateQuery(
                      "/app/finance/acct-i/reports/profit-and-loss",
                      range().from,
                      range().to,
                    )}
                    class="font-medium text-brand-700 hover:underline"
                  >
                    Open full P&amp;L
                  </A>
                </div>
              </div>
              <Show
                when={d().has_journal_pnl}
                fallback={
                  <p class="rounded-lg border border-dashed border-stroke bg-white px-3 py-3 text-sm text-text-secondary">
                    No posted journal P&amp;L in this window yet.{" "}
                    <A
                      href={withReportDateQuery(
                        "/app/finance/acct-i/reports/profit-and-loss",
                        range().from,
                        range().to,
                      )}
                      class="font-medium text-brand-700 hover:underline"
                    >
                      Open Profit &amp; Loss
                    </A>{" "}
                    or post journals under Bookkeeping.
                  </p>
                }
              >
                <div class="grid gap-3 sm:grid-cols-3">
                  <Kpi
                    label="Income"
                    value={formatPeso(d().pnl_income)}
                    href={withReportDateQuery(
                      "/app/finance/acct-i/reports/profit-and-loss",
                      range().from,
                      range().to,
                    )}
                  />
                  <Kpi
                    label="Expense"
                    value={formatPeso(d().pnl_expense)}
                    href={withReportDateQuery(
                      "/app/finance/acct-i/reports/profit-and-loss",
                      range().from,
                      range().to,
                    )}
                  />
                  <Kpi
                    label="Net"
                    value={formatPeso(d().pnl_net)}
                    href={withReportDateQuery(
                      "/app/finance/acct-i/reports/profit-and-loss",
                      range().from,
                      range().to,
                    )}
                    warn={(d().pnl_net ?? 0) < 0}
                  />
                </div>
              </Show>
            </section>

            <section class="grid gap-4 lg:grid-cols-2">
              <div class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
                <h3 class="mb-3 text-sm font-semibold text-text-primary">Top customers</h3>
                <Show when={(d().top_customers?.length ?? 0) > 0} fallback={<p class="text-sm text-text-secondary">No sales in this window.</p>}>
                  <ul class="space-y-2">
                    <For each={d().top_customers ?? []}>
                      {(row) => (
                        <li class="flex items-center justify-between gap-2 text-sm">
                          <span class="truncate text-text-primary">{row.label}</span>
                          <span class="font-semibold text-brand-600">{formatPeso(row.amount)}</span>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </div>
              <div class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
                <h3 class="mb-3 text-sm font-semibold text-text-primary">Top items (qty)</h3>
                <Show when={(d().top_items?.length ?? 0) > 0} fallback={<p class="text-sm text-text-secondary">No line qty in this window.</p>}>
                  <ul class="space-y-2">
                    <For each={d().top_items ?? []}>
                      {(row) => (
                        <li class="flex items-center justify-between gap-2 text-sm">
                          <span class="truncate text-text-primary">{row.label}</span>
                          <span class="font-semibold text-brand-600">{int(row.amount)}</span>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </div>
            </section>

            <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
              <h3 class="mb-3 text-sm font-semibold text-text-primary">
                Risk signals
                <Show when={(d().red_flag_total ?? 0) > 0}>
                  <span class="ml-2 text-amber-700">({int(d().red_flag_total)})</span>
                </Show>
              </h3>
              <Show when={(d().red_flags?.length ?? 0) > 0} fallback={<p class="text-sm text-text-secondary">No major risk signals.</p>}>
                <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <For each={d().red_flags ?? []}>
                    {(f) => (
                      <A href={f.href || "/app/reports"} class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                        <div class="font-semibold text-amber-900">{f.label}</div>
                        <div class="text-amber-800">{int(f.count)}</div>
                      </A>
                    )}
                  </For>
                </div>
              </Show>
            </section>

            <Show when={(d().overdue_alerts?.length ?? 0) > 0}>
              <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
                <h3 class="mb-3 text-sm font-semibold text-text-primary">Top overdue AR</h3>
                <ul class="space-y-2">
                  <For each={d().overdue_alerts ?? []}>
                    {(row) => (
                      <li class="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span class="text-text-primary">{row.label}</span>
                        <span class="font-semibold text-amber-700">
                          {formatPeso(row.amount)}
                          <Show when={row.count}> · {row.count}d</Show>
                        </span>
                      </li>
                    )}
                  </For>
                </ul>
              </section>
            </Show>

            <Show when={(d().profit_products?.length ?? 0) > 0}>
              <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
                <h3 class="mb-3 text-sm font-semibold text-text-primary">Margin by product (90d)</h3>
                <ul class="space-y-2">
                  <For each={d().profit_products ?? []}>
                    {(row) => (
                      <li class="flex items-center justify-between gap-2 text-sm">
                        <span class="truncate">{row.label}</span>
                        <span class="font-semibold text-brand-600">{formatPeso(row.amount)}</span>
                      </li>
                    )}
                  </For>
                </ul>
              </section>
            </Show>

            <p class="text-xs text-text-secondary">
              Snapshot uses the selected date range. Charts below show live operations data.
            </p>
          </>
        )}
      </Show>

      <OpsIntelligencePanel variant={opsVariant()} />
    </div>
  );
}
