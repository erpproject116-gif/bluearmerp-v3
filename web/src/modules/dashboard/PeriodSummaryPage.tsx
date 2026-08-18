import { A, useSearchParams } from "@solidjs/router";
import { For, Show, createMemo } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { DashboardLayout } from "./DashboardLayout";
import { apiFetch } from "../../shared/api";
import { formatPeso } from "../../shared/money";
import { OpsIntelligencePanel } from "./OpsIntelligencePanel";

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

function money(n: number | undefined) {
  return formatPeso(n ?? 0);
}

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

export default function PeriodSummaryPage() {
  const [params, setParams] = useSearchParams();
  const period = createMemo(() => (params.period === "monthly" ? "monthly" : "weekly"));

  const q = createQuery(() => ({
    queryKey: ["dashboard-period-summary", period()],
    queryFn: async () => {
      const res = await apiFetch<PeriodSummary>(`/api/v1/dashboard/period-summary?period=${period()}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load period summary");
      return res.data!;
    },
    staleTime: 60_000,
  }));

  return (
    <DashboardLayout>
      <div class="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-text-secondary">Business intelligence</p>
            <h1 class="text-2xl font-bold text-text-primary">Period summary</h1>
            <Show when={q.data}>
              {(d) => (
                <p class="mt-1 text-sm text-text-secondary">
                  {d().window_label} · as of {d().as_of}
                  <Show when={d().company_name}> · {d().company_name}</Show>
                </p>
              )}
            </Show>
          </div>
          <div class="flex gap-2">
            <button
              type="button"
              class={`rounded-lg px-3 py-1.5 text-sm font-semibold ${period() === "weekly" ? "bg-brand-600 text-white" : "border border-stroke bg-white text-text-primary"}`}
              onClick={() => setParams({ period: "weekly" })}
            >
              Weekly
            </button>
            <button
              type="button"
              class={`rounded-lg px-3 py-1.5 text-sm font-semibold ${period() === "monthly" ? "bg-brand-600 text-white" : "border border-stroke bg-white text-text-primary"}`}
              onClick={() => setParams({ period: "monthly" })}
            >
              Monthly
            </button>
            <A href="/app/dashboard" class="rounded-lg border border-stroke bg-white px-3 py-1.5 text-sm font-semibold text-text-primary">
              Dashboard
            </A>
          </div>
        </div>

        <Show when={q.isError}>
          <p class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {(q.error as Error)?.message ?? "Could not load period summary."}
          </p>
        </Show>
        <Show when={q.isLoading}>
          <p class="text-sm text-text-secondary">Loading period summary…</p>
        </Show>

        <Show when={q.data}>
          {(d) => (
            <>
              <section class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi label="Sales in window" value={money(d().sales_in_window)} href="/app/sales/sales" />
                <Kpi label="Sales MTD" value={money(d().sales_mtd)} href="/app/sales/sales" />
                <Show when={period() === "monthly"}>
                  <Kpi label="Sales YTD" value={money(d().sales_ytd)} href="/app/sales/sales" />
                  <Kpi label="Cash net YTD" value={money(d().cash_net_ytd)} href="/app/finance/collections" />
                </Show>
                <Show when={period() === "weekly"}>
                  <Kpi label="Cash net MTD" value={money(d().cash_net_mtd)} href="/app/finance/collections" />
                </Show>
                <Kpi
                  label="Cash in / out MTD"
                  value={`${money(d().cash_inflow_mtd)} / ${money(d().cash_outflow_mtd)}`}
                  href="/app/finance/disbursements"
                />
              </section>

              <section class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi
                  label="AR total / overdue"
                  value={`${money(d().ar_total)} / ${money(d().ar_overdue)}`}
                  href="/app/finance/collections"
                  warn={(d().ar_overdue ?? 0) > 0}
                />
                <Kpi
                  label="AP total / overdue"
                  value={`${money(d().ap_total)} / ${money(d().ap_overdue)}`}
                  href="/app/finance/disbursements"
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

              <Show when={period() === "monthly" && d().has_journal_pnl}>
                <section>
                  <h2 class="mb-2 text-sm font-semibold text-text-primary">Profit &amp; loss (posted journals)</h2>
                  <div class="grid gap-3 sm:grid-cols-3">
                    <Kpi label="Income" value={money(d().pnl_income)} href="/app/finance/acct-i/reports/profit-and-loss" />
                    <Kpi label="Expense" value={money(d().pnl_expense)} href="/app/finance/acct-i/reports/profit-and-loss" />
                    <Kpi label="Net" value={money(d().pnl_net)} href="/app/finance/acct-i/reports/profit-and-loss" warn={(d().pnl_net ?? 0) < 0} />
                  </div>
                </section>
              </Show>

              <section class="grid gap-4 lg:grid-cols-2">
                <div class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
                  <h2 class="mb-3 text-sm font-semibold text-text-primary">Top customers</h2>
                  <Show when={(d().top_customers?.length ?? 0) > 0} fallback={<p class="text-sm text-text-secondary">No sales in this window.</p>}>
                    <ul class="space-y-2">
                      <For each={d().top_customers ?? []}>
                        {(row) => (
                          <li class="flex items-center justify-between gap-2 text-sm">
                            <span class="truncate text-text-primary">{row.label}</span>
                            <span class="font-semibold text-brand-600">{money(row.amount)}</span>
                          </li>
                        )}
                      </For>
                    </ul>
                  </Show>
                </div>
                <div class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
                  <h2 class="mb-3 text-sm font-semibold text-text-primary">Top items (qty)</h2>
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
                <h2 class="mb-3 text-sm font-semibold text-text-primary">
                  Risk signals
                  <Show when={(d().red_flag_total ?? 0) > 0}>
                    <span class="ml-2 text-amber-700">({int(d().red_flag_total)})</span>
                  </Show>
                </h2>
                <Show when={(d().red_flags?.length ?? 0) > 0} fallback={<p class="text-sm text-text-secondary">No major risk signals.</p>}>
                  <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <For each={d().red_flags ?? []}>
                      {(f) => (
                        <A href={f.href || "/app/dashboard"} class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
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
                  <h2 class="mb-3 text-sm font-semibold text-text-primary">Top overdue AR</h2>
                  <ul class="space-y-2">
                    <For each={d().overdue_alerts ?? []}>
                      {(row) => (
                        <li class="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span class="text-text-primary">{row.label}</span>
                          <span class="font-semibold text-amber-700">
                            {money(row.amount)}
                            <Show when={row.count}> · {row.count}d</Show>
                          </span>
                        </li>
                      )}
                    </For>
                  </ul>
                </section>
              </Show>

              <Show when={period() === "monthly" && (d().profit_products?.length ?? 0) > 0}>
                <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
                  <h2 class="mb-3 text-sm font-semibold text-text-primary">Margin by product (90d)</h2>
                  <ul class="space-y-2">
                    <For each={d().profit_products ?? []}>
                      {(row) => (
                        <li class="flex items-center justify-between gap-2 text-sm">
                          <span class="truncate">{row.label}</span>
                          <span class="font-semibold text-brand-600">{money(row.amount)}</span>
                        </li>
                      )}
                    </For>
                  </ul>
                </section>
              </Show>

              <p class="text-xs text-text-secondary">
                The same snapshot is emailed to the owner and store admins via weekly/monthly BI cron jobs. Instant per-sale emails are not sent on the free plan.
              </p>

              <OpsIntelligencePanel variant="period" />
            </>
          )}
        </Show>
      </div>
    </DashboardLayout>
  );
}
