import { A } from "@solidjs/router";
import { For, Show, createMemo, createSignal } from "solid-js";
import { formatMoney } from "../../shared/money";
import { apiFetch } from "../../shared/api";
import { useToast } from "../../shared/toast";
import {
  useFinancialHealth,
  type FinancialHealthCashMonth,
  type ProfitRow,
} from "../../shared/useFinancialHealth";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";

function DualBarChart(props: { title: string; months: FinancialHealthCashMonth[] }) {
  const max = () => Math.max(...props.months.flatMap((m) => [m.inflow, m.outflow]), 1);
  return (
    <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
      <div class="mb-3 flex items-center justify-between gap-2">
        <h3 class="text-sm font-semibold text-text-primary">{props.title}</h3>
        <A href="/app/finance/acct-i/reports/cash-flow-statement" class="text-xs text-brand-600 hover:underline">
          Statement
        </A>
      </div>
      <Show when={props.months.length > 0} fallback={<p class="text-sm text-text-secondary">No cash movements yet.</p>}>
        <div class="flex items-end gap-1 sm:gap-1.5" style={{ height: "160px" }}>
          <For each={props.months}>
            {(m) => {
              const inPct = () => Math.max(m.inflow > 0 ? 4 : 0, (m.inflow / max()) * 100);
              const outPct = () => Math.max(m.outflow > 0 ? 4 : 0, (m.outflow / max()) * 100);
              return (
                <div class="flex min-w-0 flex-1 flex-col items-center justify-end gap-0.5">
                  <div class="flex w-full items-end justify-center gap-0.5" style={{ height: "130px" }}>
                    <div
                      class="w-1/2 rounded-t bg-emerald-500"
                      style={{ height: `${inPct()}%` }}
                      title={`In ${m.period}: ${formatMoney(m.inflow)}`}
                    />
                    <div
                      class="w-1/2 rounded-t bg-rose-400"
                      style={{ height: `${outPct()}%` }}
                      title={`Out ${m.period}: ${formatMoney(m.outflow)}`}
                    />
                  </div>
                  <span class="truncate text-[9px] text-text-secondary">{m.period.slice(5)}</span>
                </div>
              );
            }}
          </For>
        </div>
        <div class="mt-2 flex gap-4 text-[11px] text-text-secondary">
          <span class="inline-flex items-center gap-1.5">
            <span class="h-2 w-2 rounded-full bg-emerald-500" /> In (receipts)
          </span>
          <span class="inline-flex items-center gap-1.5">
            <span class="h-2 w-2 rounded-full bg-rose-400" /> Out (payments)
          </span>
        </div>
      </Show>
    </section>
  );
}

function MarginBars(props: { title: string; rows: ProfitRow[]; empty: string; href: string }) {
  const max = () => Math.max(...props.rows.map((r) => r.revenue), 1);
  return (
    <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
      <div class="mb-3 flex items-center justify-between gap-2">
        <h3 class="text-sm font-semibold text-text-primary">{props.title}</h3>
        <A href={props.href} class="text-xs text-brand-600 hover:underline">
          Details
        </A>
      </div>
      <Show when={props.rows.length > 0} fallback={<p class="text-sm text-text-secondary">{props.empty}</p>}>
        <ul class="space-y-2.5">
          <For each={props.rows}>
            {(r) => (
              <li>
                <div class="mb-0.5 flex items-center justify-between gap-2 text-xs">
                  <span class="truncate font-medium text-text-primary" title={r.label}>
                    {r.label}
                  </span>
                  <span class={`shrink-0 tabular-nums ${r.margin >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                    {formatMoney(r.margin)} · {r.margin_pct.toFixed(0)}%
                  </span>
                </div>
                <div class="h-2 overflow-hidden rounded-full bg-panel-strong">
                  <div class="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, (r.revenue / max()) * 100)}%` }} />
                </div>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </section>
  );
}

function RecurringQuickAdd(props: { onSaved: () => void }) {
  const toast = useToast();
  const [open, setOpen] = createSignal(false);
  const [name, setName] = createSignal("");
  const [amount, setAmount] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  const save = async () => {
    const n = name().trim();
    const amt = Number(amount());
    if (!n || !Number.isFinite(amt) || amt < 0) {
      toast.error("Enter a name and amount.");
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch("/api/v1/finance/recurring-expenses", {
        method: "POST",
        body: JSON.stringify({ name: n, amount: amt, frequency: "monthly", category: "subscription" }),
      });
      if (!res.success) throw new Error(res.message ?? "Save failed");
      toast.success("Recurring expense added.");
      setName("");
      setAmount("");
      setOpen(false);
      props.onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="mt-3 border-t border-stroke/60 pt-3">
      <Show
        when={open()}
        fallback={
          <button type="button" class="text-xs font-medium text-brand-600 hover:underline" onClick={() => setOpen(true)}>
            + Add recurring expense
          </button>
        }
      >
        <div class="grid gap-2 sm:grid-cols-[1fr_7rem_auto]">
          <Field label="Name">
            <input class={inputClass} value={name()} onInput={(e) => setName(e.currentTarget.value)} placeholder="e.g. Office SaaS" />
          </Field>
          <Field label="Monthly ₱">
            <input class={inputClass} type="number" min="0" step="0.01" value={amount()} onInput={(e) => setAmount(e.currentTarget.value)} />
          </Field>
          <div class="flex items-end gap-2">
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              disabled={saving()}
              onClick={() => void save()}
            >
              Save
            </button>
            <button type="button" class="px-2 py-2 text-sm text-text-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}

/** Owner financial health: cash pulse, overdue collections, profit, recurring, pipeline. */
export function FinancialHealthPanel() {
  const health = useFinancialHealth();
  const d = () => health.data;
  const loading = () => health.isFetching && !health.data;

  const arOverduePct = createMemo(() => {
    const t = d()?.receivables.total ?? 0;
    if (t <= 0) return 0;
    return Math.min(100, ((d()?.receivables.overdue ?? 0) / t) * 100);
  });

  return (
    <div class="mb-8 space-y-4">
      <div class="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 class="text-lg font-semibold text-text-primary">Financial health</h2>
          <p class="text-sm text-text-secondary">
            Cash in vs out, overdue collections, what makes money, and quiet recurring drains.
          </p>
        </div>
        <Show when={d()?.as_of}>
          <span class="text-xs text-text-secondary">As of {d()!.as_of}</span>
        </Show>
      </div>

      <Show when={loading()}>
        <p class="text-sm text-text-secondary">Loading financial health…</p>
      </Show>

      <Show when={d()}>
        {/* KPI strip */}
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <A href="/app/finance/reports/ar-aging" class="rounded-xl border border-stroke bg-white p-4 shadow-sm hover:border-brand-300">
            <p class="text-xs uppercase tracking-wide text-text-secondary">Cash net MTD</p>
            <p class={`mt-1 text-xl font-bold ${(d()!.cash.net_mtd >= 0) ? "text-emerald-700" : "text-rose-600"}`}>
              {formatMoney(d()!.cash.net_mtd)}
            </p>
            <p class="mt-1 text-[11px] text-text-secondary">
              In {formatMoney(d()!.cash.inflow_mtd)} · Out {formatMoney(d()!.cash.outflow_mtd)}
            </p>
          </A>
          <A href="/app/finance/reports/ar-aging" class="rounded-xl border border-stroke bg-white p-4 shadow-sm hover:border-brand-300">
            <p class="text-xs uppercase tracking-wide text-text-secondary">Receivables</p>
            <p class="mt-1 text-xl font-bold text-text-primary">{formatMoney(d()!.receivables.total)}</p>
            <p class="mt-1 text-[11px] text-amber-700">Overdue {formatMoney(d()!.receivables.overdue)}</p>
          </A>
          <A href="/app/finance/reports/ap-aging-details" class="rounded-xl border border-stroke bg-white p-4 shadow-sm hover:border-brand-300">
            <p class="text-xs uppercase tracking-wide text-text-secondary">Payables</p>
            <p class="mt-1 text-xl font-bold text-text-primary">{formatMoney(d()!.payables.total)}</p>
            <p class="mt-1 text-[11px] text-text-secondary">Past due {formatMoney(d()!.payables.overdue)}</p>
          </A>
          <A href="/app/crm/opportunities" class="rounded-xl border border-stroke bg-white p-4 shadow-sm hover:border-brand-300">
            <p class="text-xs uppercase tracking-wide text-text-secondary">Pipeline (weighted)</p>
            <p class="mt-1 text-xl font-bold text-text-primary">{formatMoney(d()!.pipeline.weighted_pipeline_value)}</p>
            <p class="mt-1 text-[11px] text-text-secondary">
              {d()!.pipeline.open_opportunities} deals · {d()!.pipeline.follow_ups_due} follow-ups
            </p>
          </A>
          <div class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
            <p class="text-xs uppercase tracking-wide text-text-secondary">Recurring burn / mo</p>
            <p class="mt-1 text-xl font-bold text-text-primary">{formatMoney(d()!.recurring.monthly_burn)}</p>
            <p class="mt-1 text-[11px] text-text-secondary">
              {d()!.recurring.active_count} active · ~{formatMoney(d()!.recurring.yearly_burn)} / yr
            </p>
          </div>
        </div>

        {/* Overdue alerts */}
        <Show when={d()!.overdue_alert_count > 0}>
          <section class="rounded-xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm">
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 class="text-sm font-semibold text-amber-950">Overdue invoice alerts</h3>
                <p class="text-xs text-amber-900/80">
                  {d()!.overdue_alert_count} unpaid invoice(s) past due — follow up to protect cash flow.
                </p>
              </div>
              <A href="/app/finance/reports/ar-aging" class="text-xs font-medium text-brand-700 hover:underline">
                Open A/R aging
              </A>
            </div>
            <div class="mb-3 h-2 overflow-hidden rounded-full bg-white/80">
              <div class="h-full rounded-full bg-amber-500" style={{ width: `${arOverduePct()}%` }} />
            </div>
            <ul class="divide-y divide-amber-200/70 text-sm">
              <For each={d()!.overdue_alerts}>
                {(row) => (
                  <li class="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div>
                      <A href={`/app/sales/sales?q=${encodeURIComponent(row.sales_no)}`} class="font-medium text-brand-700 hover:underline">
                        {row.sales_no}
                      </A>
                      <span class="text-text-secondary"> — {row.customer_name}</span>
                      <div class="text-[11px] text-amber-900/70">
                        Due {row.due_date} · {row.age_days}d · bucket {row.age_bucket}
                      </div>
                    </div>
                    <span class="font-semibold tabular-nums text-amber-950">{formatMoney(row.balance)}</span>
                  </li>
                )}
              </For>
            </ul>
            <p class="mt-2 text-[11px] text-amber-900/70">
              Alerts also sync to CRM notifications when the overdue-AR job runs (rule: Overdue customer invoices).
            </p>
          </section>
        </Show>

        <div class="grid gap-4 lg:grid-cols-2">
          <DualBarChart title="Cash in vs out (12 months)" months={d()!.cash.months} />
          <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
            <div class="mb-3 flex items-center justify-between">
              <h3 class="text-sm font-semibold text-text-primary">Sales pipeline</h3>
              <A href="/app/crm/dashboard" class="text-xs text-brand-600 hover:underline">
                CRM
              </A>
            </div>
            <dl class="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt class="text-xs text-text-secondary">Open quotes value</dt>
                <dd class="font-semibold">{formatMoney(d()!.pipeline.open_quotations_value)}</dd>
              </div>
              <div>
                <dt class="text-xs text-text-secondary">Expected deal value</dt>
                <dd class="font-semibold">{formatMoney(d()!.pipeline.expected_pipeline_value)}</dd>
              </div>
              <div>
                <dt class="text-xs text-text-secondary">Quotes expiring 7d</dt>
                <dd class="font-semibold">{d()!.pipeline.quotes_expiring_7d}</dd>
              </div>
              <div>
                <dt class="text-xs text-text-secondary">Follow-ups due</dt>
                <dd class="font-semibold">
                  <A href="/app/crm/follow-up-tasks" class="text-brand-600 hover:underline">
                    {d()!.pipeline.follow_ups_due}
                  </A>
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <div class="grid gap-4 lg:grid-cols-2">
          <MarginBars
            title="Profit by product (90d)"
            rows={d()!.profit_by_product}
            empty="No sales lines in the last 90 days."
            href="/app/sales/sales"
          />
          <MarginBars
            title="Profit by project (90d)"
            rows={d()!.profit_by_project}
            empty="No project sales in the last 90 days."
            href="/app/finance/acct-i/reports/profit-and-loss"
          />
        </div>

        <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
          <div class="mb-3 flex items-center justify-between gap-2">
            <div>
              <h3 class="text-sm font-semibold text-text-primary">Subscription / recurring auditor</h3>
              <p class="text-xs text-text-secondary">Recurring costs that quietly drain budget (normalized to monthly).</p>
            </div>
          </div>
          <Show
            when={d()!.recurring.items.length > 0}
            fallback={<p class="text-sm text-text-secondary">No recurring expenses tracked yet. Add SaaS, rent, or retainers below.</p>}
          >
            <ul class="divide-y divide-stroke/50 text-sm">
              <For each={d()!.recurring.items}>
                {(item) => (
                  <li class="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div>
                      <span class="font-medium text-text-primary">{item.name}</span>
                      <span class="text-text-secondary">
                        {" "}
                        · {item.category}
                        {item.vendor_name ? ` · ${item.vendor_name}` : ""}
                      </span>
                      <div class="text-[11px] text-text-secondary">
                        {item.frequency}
                        {item.next_due_date ? ` · next ${item.next_due_date}` : ""}
                      </div>
                    </div>
                    <span class="tabular-nums text-text-primary">{formatMoney(item.monthly_equiv)}/mo</span>
                  </li>
                )}
              </For>
            </ul>
          </Show>
          <RecurringQuickAdd onSaved={() => void health.refetch()} />
        </section>
      </Show>
    </div>
  );
}
