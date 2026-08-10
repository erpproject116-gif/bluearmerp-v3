import { A } from "@solidjs/router";
import { createMemo, Show } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { formatMoney } from "../../shared/money";
import { useAuth } from "../../shared/auth-context";
import { useArAgingReport, useApAgingReport } from "../../shared/reports/useModuleReports";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function yearStartISO() {
  const d = new Date();
  return `${d.getFullYear()}-01-01`;
}

type CashFlowPayload = {
  rows: { section: string; account_code: string; account_name: string; amount: number }[];
  operating_total: number;
  investing_total: number;
  financing_total: number;
  net_change: number;
  has_journal_data: boolean;
};

function AgingSplitBar(props: {
  title: string;
  totalLabel: string;
  total: number;
  current: number;
  overdue: number;
  href: string;
  newHref: string;
  newLabel: string;
}) {
  const total = () => Math.max(props.total, 0.01);
  const currentPct = () => Math.min(100, (Math.max(props.current, 0) / total()) * 100);
  const overduePct = () => Math.min(100 - currentPct(), (Math.max(props.overdue, 0) / total()) * 100);

  return (
    <section class="rounded-xl border border-stroke bg-surface p-5 shadow-sm">
      <div class="mb-3 flex items-center justify-between gap-2">
        <h3 class="text-sm font-semibold text-text-primary">{props.title}</h3>
        <A href={props.newHref} class="text-sm font-medium text-brand-600 hover:underline">
          + {props.newLabel}
        </A>
      </div>
      <A href={props.href} class="block">
        <p class="text-xs text-text-secondary">{props.totalLabel}</p>
        <p class="mt-1 text-2xl font-bold text-text-primary">{formatMoney(props.total)}</p>
        <div class="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-panel-strong">
          <div class="bg-brand-500 transition-all" style={{ width: `${currentPct()}%` }} title={`Current: ${formatMoney(props.current)}`} />
          <div class="bg-amber-500 transition-all" style={{ width: `${overduePct()}%` }} title={`Overdue: ${formatMoney(props.overdue)}`} />
        </div>
        <div class="mt-3 flex flex-wrap gap-4 text-xs text-text-secondary">
          <span class="inline-flex items-center gap-1.5">
            <span class="h-2 w-2 rounded-full bg-brand-500" />
            Current: {formatMoney(props.current)}
          </span>
          <span class="inline-flex items-center gap-1.5">
            <span class="h-2 w-2 rounded-full bg-amber-500" />
            Overdue: {formatMoney(props.overdue)}
          </span>
        </div>
      </A>
    </section>
  );
}

function CashFlowCard() {
  const qs = () => {
    const p = new URLSearchParams();
    p.set("date_from", yearStartISO());
    p.set("date_to", todayISO());
    return p.toString();
  };

  const report = createQuery(() => ({
    queryKey: ["home-cash-flow", qs()],
    queryFn: async () => {
      const res = await apiFetch<CashFlowPayload>(`/api/v1/finance/reports/cash-flow-statement?${qs()}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load cash flow");
      return res.data!;
    },
    staleTime: 60_000,
  }));

  const incoming = createMemo(() => {
    const rows = report.data?.rows ?? [];
    return rows.reduce((s, r) => s + (r.amount > 0 ? r.amount : 0), 0);
  });
  const outgoing = createMemo(() => {
    const rows = report.data?.rows ?? [];
    return rows.reduce((s, r) => s + (r.amount < 0 ? Math.abs(r.amount) : 0), 0);
  });
  const net = () => report.data?.net_change ?? incoming() - outgoing();

  const chartMax = () => Math.max(incoming(), outgoing(), Math.abs(net()), 1);

  return (
    <section class="rounded-xl border border-stroke bg-surface p-5 shadow-sm lg:col-span-2">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 class="text-sm font-semibold text-text-primary">Cash flow</h3>
        <A
          href="/app/finance/acct-i/reports/cash-flow-statement"
          class="text-xs font-medium text-brand-600 hover:underline"
        >
          This year · Full statement
        </A>
      </div>
      <Show when={report.isFetching && !report.data}>
        <p class="text-sm text-text-secondary">Loading cash flow…</p>
      </Show>
      <Show when={report.data}>
        <div class="grid gap-6 lg:grid-cols-[1fr_14rem]">
          <div class="flex items-end gap-3" style={{ height: "140px" }}>
            <div class="flex flex-1 flex-col items-center justify-end gap-1">
              <span class="text-[10px] text-emerald-700">{formatMoney(incoming())}</span>
              <div
                class="w-full max-w-[4rem] rounded-t bg-emerald-500"
                style={{ height: `${Math.max(8, (incoming() / chartMax()) * 100)}%` }}
              />
              <span class="text-[10px] text-text-secondary">In</span>
            </div>
            <div class="flex flex-1 flex-col items-center justify-end gap-1">
              <span class="text-[10px] text-red-700">{formatMoney(outgoing())}</span>
              <div
                class="w-full max-w-[4rem] rounded-t bg-red-500"
                style={{ height: `${Math.max(8, (outgoing() / chartMax()) * 100)}%` }}
              />
              <span class="text-[10px] text-text-secondary">Out</span>
            </div>
            <div class="flex flex-1 flex-col items-center justify-end gap-1">
              <span class="text-[10px] text-brand-700">{formatMoney(net())}</span>
              <div
                class="w-full max-w-[4rem] rounded-t bg-brand-500"
                style={{ height: `${Math.max(8, (Math.abs(net()) / chartMax()) * 100)}%` }}
              />
              <span class="text-[10px] text-text-secondary">Net</span>
            </div>
          </div>
          <ul class="space-y-2 text-sm">
            <li class="flex justify-between gap-2">
              <span class="text-text-secondary">Incoming (+)</span>
              <span class="font-medium text-emerald-700">{formatMoney(incoming())}</span>
            </li>
            <li class="flex justify-between gap-2">
              <span class="text-text-secondary">Outgoing (−)</span>
              <span class="font-medium text-red-700">{formatMoney(outgoing())}</span>
            </li>
            <li class="flex justify-between gap-2 border-t border-stroke pt-2">
              <span class="text-text-secondary">Net change</span>
              <span class="font-semibold text-text-primary">{formatMoney(net())}</span>
            </li>
            <li class="pt-1 text-xs text-text-secondary">
              From posted cash journals this year. Bank account registers are separate from the general ledger.
            </li>
          </ul>
        </div>
      </Show>
      <Show when={!report.isFetching && report.isError}>
        <p class="text-sm text-text-secondary">
          Cash flow needs journal entries.{" "}
          <A href="/app/finance/acct-i/journal-entries" class="font-medium text-brand-600 hover:underline">
            Open journals
          </A>
        </p>
      </Show>
    </section>
  );
}

/**
 * Home cards: receivables / payables / cash flow.
 * Totals and overdue buckets come only from A/R and A/P aging API summaries
 * (same handlers as /finance/reports/ar-aging and ap-aging-details) — do not recompute here.
 */
export function HomeFinanceOverview() {
  const auth = useAuth();
  const asOf = todayISO();

  const ar = useArAgingReport(() => ({
    filters: { as_of: asOf },
    page: 1,
    pageSize: 1,
    sort: "due_date",
    order: "asc",
    enabled: Boolean(auth.me),
  }));
  const ap = useApAgingReport(() => ({
    filters: { as_of: asOf },
    page: 1,
    pageSize: 1,
    sort: "due_date",
    order: "asc",
    enabled: Boolean(auth.me),
  }));

  const arSummary = () => ar.data?.summary;
  const apSummary = () => ap.data?.summary;
  // Overdue = aging buckets excluding "current" — matches aging report summary fields.
  const arOverdue = () => {
    const s = arSummary();
    if (!s) return 0;
    return s.days_1_30 + s.days_31_60 + s.days_61_90 + s.over_90;
  };
  const apOverdue = () => {
    const s = apSummary();
    if (!s) return 0;
    return s.days_1_30 + s.days_31_60 + s.days_61_90 + s.over_90;
  };

  const company = () => auth.me?.tenant.company_name ?? "your business";
  const hello = () => {
    const name = auth.me?.user?.full_name?.trim();
    return name ? `Hello, ${name}` : "Hello";
  };

  return (
    <div class="mb-6 space-y-4">
      <div>
        <h2 class="text-xl font-semibold text-text-primary">{hello()}</h2>
        <p class="text-sm text-text-secondary">{company()}</p>
      </div>
      <div class="grid gap-4 lg:grid-cols-2">
        <AgingSplitBar
          title="Total receivables"
          totalLabel="Total unpaid invoices"
          total={arSummary()?.total ?? 0}
          current={arSummary()?.current ?? 0}
          overdue={arOverdue()}
          href="/app/finance/reports/ar-aging"
          newHref="/app/sales/sales/new"
          newLabel="New"
        />
        <AgingSplitBar
          title="Total payables"
          totalLabel="Total unpaid bills"
          total={apSummary()?.total ?? 0}
          current={apSummary()?.current ?? 0}
          overdue={apOverdue()}
          href="/app/finance/reports/ap-aging-details"
          newHref="/app/purchases/purchase-receive/new"
          newLabel="New"
        />
        <CashFlowCard />
      </div>
      <Show when={(ar.isFetching || ap.isFetching) && !ar.data && !ap.data}>
        <p class="text-sm text-text-secondary">Loading receivables and payables…</p>
      </Show>
    </div>
  );
}
