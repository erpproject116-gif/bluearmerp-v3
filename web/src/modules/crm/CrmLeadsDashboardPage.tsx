import { A } from "@solidjs/router";
import { For, Show, createMemo } from "solid-js";
import { canViewCrmAnalytics, useAuth } from "../../shared/auth-context";
import { formatMoney } from "../../shared/money";
import {
  useCrmLeadsDashboard,
  type AgingBucket,
  type CrmLeadsDashboardSummary,
} from "../../shared/useCrmDashboard";
import { CrmLayout } from "./CrmLayout";

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  lost: "Lost",
  converted: "Converted",
};

const AGING_LABEL: Record<string, string> = {
  "0_7": "0–7 days",
  "8_30": "8–30 days",
  "31_90": "31–90 days",
  "90_plus": "90+ days",
};

function agingCount(aging: AgingBucket[] | undefined, bucket: string): number {
  return aging?.find((a) => a.bucket === bucket)?.count ?? 0;
}

export default function CrmLeadsDashboardPage() {
  const auth = useAuth();
  const dash = useCrmLeadsDashboard();
  const summary = () => dash.data ?? ({} as CrmLeadsDashboardSummary);
  const analytics = () => canViewCrmAnalytics(auth.me);

  const totalExpected = createMemo(() =>
    (summary().opportunities_by_stage ?? []).reduce((sum, s) => sum + (s.expected_value ?? 0), 0),
  );

  return (
    <CrmLayout>
      <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-lg font-semibold text-text-primary">Leads dashboard</h1>
          <p class="text-sm text-text-secondary">
            {summary().scoped_view
              ? "Your assigned leads, opportunities, and follow-ups."
              : "Lead funnel, opportunity pipeline, and follow-up pressure."}
          </p>
        </div>
        <div class="flex gap-2 text-sm">
          <A href="/app/crm/leads" class="rounded-lg border border-stroke px-3 py-1.5 hover:bg-slate-50">
            All leads
          </A>
          <A href="/app/crm/opportunities" class="rounded-lg border border-stroke px-3 py-1.5 hover:bg-slate-50">
            Opportunities
          </A>
          <A href="/app/crm/follow-up-tasks" class="rounded-lg border border-stroke px-3 py-1.5 hover:bg-slate-50">
            Follow-ups
          </A>
        </div>
      </div>

      <Show when={dash.isFetching && !dash.data}>
        <p class="text-sm text-text-secondary">Loading leads dashboard…</p>
      </Show>

      <div class="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <A href="/app/crm/leads" class="rounded-xl border border-stroke bg-white p-4 shadow-sm transition hover:shadow-md">
          <p class="text-xs font-medium uppercase tracking-wide text-text-secondary">Open leads</p>
          <p class="mt-2 text-3xl font-bold text-text-primary">{summary().open_lead_count ?? 0}</p>
        </A>
        <A href="/app/crm/follow-up-tasks" class="rounded-xl border border-stroke bg-white p-4 shadow-sm transition hover:shadow-md">
          <p class="text-xs font-medium uppercase tracking-wide text-text-secondary">Follow-ups overdue</p>
          <p class="mt-2 text-3xl font-bold text-red-600">{summary().follow_ups_overdue ?? 0}</p>
        </A>
        <A href="/app/crm/follow-up-tasks" class="rounded-xl border border-stroke bg-white p-4 shadow-sm transition hover:shadow-md">
          <p class="text-xs font-medium uppercase tracking-wide text-text-secondary">Follow-ups due soon</p>
          <p class="mt-2 text-3xl font-bold text-amber-600">{summary().follow_ups_due_soon ?? 0}</p>
        </A>
        <div class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
          <p class="text-xs font-medium uppercase tracking-wide text-text-secondary">Pipeline value</p>
          <p class="mt-2 text-3xl font-bold text-text-primary">
            {analytics() ? formatMoney(totalExpected()) : "—"}
          </p>
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-3">
        <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm lg:col-span-1">
          <h2 class="mb-3 text-sm font-semibold text-text-primary">By status</h2>
          <ul class="space-y-2">
            <For each={summary().by_status ?? []}>
              {(row) => (
                <li>
                  <A
                    href={`/app/crm/leads?status=${encodeURIComponent(row.status)}`}
                    class="flex items-center justify-between text-sm hover:text-brand-600"
                  >
                    <span>{STATUS_LABEL[row.status] ?? row.status}</span>
                    <span class="font-medium">{row.count}</span>
                  </A>
                </li>
              )}
            </For>
          </ul>
        </section>

        <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm lg:col-span-1">
          <h2 class="mb-3 text-sm font-semibold text-text-primary">Open lead aging</h2>
          <ul class="space-y-2 text-sm">
            <For each={["0_7", "8_30", "31_90", "90_plus"]}>
              {(bucket) => (
                <li class="flex items-center justify-between">
                  <span class="text-text-secondary">{AGING_LABEL[bucket]}</span>
                  <span class="font-medium">{agingCount(summary().aging, bucket)}</span>
                </li>
              )}
            </For>
          </ul>
        </section>

        <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm lg:col-span-1">
          <div class="mb-3 flex items-center justify-between">
            <h2 class="text-sm font-semibold text-text-primary">Open opportunities</h2>
            <A href="/app/crm/opportunities" class="text-xs font-medium text-brand-600 hover:underline">
              View all
            </A>
          </div>
          <Show
            when={(summary().opportunities_by_stage ?? []).length > 0}
            fallback={<p class="text-sm text-text-secondary">No open opportunities.</p>}
          >
            <ul class="space-y-2 text-sm">
              <For each={summary().opportunities_by_stage ?? []}>
                {(row) => (
                  <li class="flex items-center justify-between gap-2">
                    <span class="capitalize text-text-primary">{row.stage}</span>
                    <span class="shrink-0 text-text-secondary">
                      {row.count}
                      <Show when={analytics() && row.expected_value > 0}>
                        <span class="ml-2">{formatMoney(row.expected_value)}</span>
                      </Show>
                    </span>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </section>
      </div>
    </CrmLayout>
  );
}
