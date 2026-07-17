import { For, Show, createSignal } from "solid-js";
import { A } from "@solidjs/router";
import { usePlatformAnalytics } from "../../shared/usePlatform";
import { LoadingText } from "../../shared/LoadingText";

function fmtDuration(sec: number | undefined | null): string {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return r ? `${m}m ${r}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}

export default function PlatformAnalyticsPage() {
  const [days, setDays] = createSignal(14);
  const q = usePlatformAnalytics(() => days());
  const totals = () => q.data?.totals;
  const trend = () => q.data?.trend ?? [];
  const topPages = () => q.data?.top_pages ?? [];
  const maxSessions = () => Math.max(1, ...trend().map((t) => t.sessions || 0));

  return (
    <div class="space-y-6">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold text-text-primary">Usage analytics</h1>
          <p class="text-sm text-text-secondary">
            Sessions, page views, active time, and abandonment across tenants — first-party telemetry, not Google Analytics.
          </p>
        </div>
        <label class="text-sm text-text-secondary">
          Range{" "}
          <select
            class="ml-1 rounded-lg border border-stroke bg-white px-2 py-1.5 text-sm"
            value={days()}
            onChange={(e) => setDays(Number(e.currentTarget.value))}
          >
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
        </label>
      </div>

      <Show when={q.isPending}>
        <LoadingText class="text-sm text-text-secondary" as="p" />
      </Show>
      <Show when={q.isError}>
        <p class="text-sm text-red-600">{(q.error as Error)?.message || "Failed to load analytics."}</p>
      </Show>

      <Show when={totals()}>
        <section class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div class="rounded-xl border border-stroke bg-white p-4">
            <p class="text-xs uppercase text-slate-500">Sessions</p>
            <p class="mt-1 text-2xl font-semibold tabular-nums">{totals()!.sessions}</p>
          </div>
          <div class="rounded-xl border border-stroke bg-white p-4">
            <p class="text-xs uppercase text-slate-500">Page views</p>
            <p class="mt-1 text-2xl font-semibold tabular-nums">{totals()!.page_views}</p>
          </div>
          <div class="rounded-xl border border-stroke bg-white p-4">
            <p class="text-xs uppercase text-slate-500">Unique users</p>
            <p class="mt-1 text-2xl font-semibold tabular-nums">{totals()!.unique_users}</p>
            <p class="mt-1 text-xs text-slate-500">Active now: {totals()!.active_now}</p>
          </div>
          <div class="rounded-xl border border-stroke bg-white p-4">
            <p class="text-xs uppercase text-slate-500">Active time</p>
            <p class="mt-1 text-2xl font-semibold tabular-nums">{fmtDuration(totals()!.active_seconds)}</p>
            <p class="mt-1 text-xs text-slate-500">
              Idle {fmtDuration(totals()!.idle_seconds)} · Abandoned 24h: {totals()!.abandoned_24h}
            </p>
          </div>
        </section>
      </Show>

      <section class="rounded-xl border border-stroke bg-white p-4">
        <h2 class="text-sm font-semibold">Daily sessions</h2>
        <Show when={trend().length === 0} fallback={
          <div class="mt-4 flex h-40 items-end gap-1">
            <For each={trend()}>
              {(row) => (
                <div class="flex flex-1 flex-col items-center gap-1" title={`${row.day}: ${row.sessions} sessions`}>
                  <div
                    class="w-full rounded-t bg-slate-800"
                    style={{ height: `${Math.max(4, (100 * (row.sessions || 0)) / maxSessions())}%` }}
                  />
                  <span class="text-[10px] text-slate-400">{String(row.day).slice(5)}</span>
                </div>
              )}
            </For>
          </div>
        }>
          <p class="mt-3 text-sm text-text-secondary">No session data yet for this range. Usage starts recording after deploy.</p>
        </Show>
      </section>

      <section class="rounded-xl border border-stroke bg-white p-4">
        <h2 class="text-sm font-semibold">Usage by customer</h2>
        <table class="mt-3 w-full text-left text-sm">
          <thead class="text-xs uppercase text-slate-500">
            <tr>
              <th class="py-2 pr-2">Customer</th>
              <th class="py-2 pr-2">Workspace</th>
              <th class="py-2 pr-2 text-right">Sessions</th>
              <th class="py-2 pr-2 text-right">Users</th>
              <th class="py-2 pr-2 text-right">Pages</th>
              <th class="py-2 pr-2 text-right">Active time</th>
              <th class="py-2 text-right">Last activity</th>
            </tr>
          </thead>
          <tbody>
            <For each={q.data?.customers ?? []} fallback={
              <tr><td colSpan={7} class="py-4 text-text-secondary">No customer usage recorded yet for this range.</td></tr>
            }>
              {(c) => (
                <tr class="border-t border-stroke/60">
                  <td class="py-2 pr-2">
                    <Show when={c.customer_id} fallback={<span class="font-medium">{c.customer_name || "—"}</span>}>
                      <A
                        href={`/app/platform-command/customers/${c.customer_id}/analytics`}
                        class="font-medium text-brand-600 hover:underline"
                      >
                        {c.customer_name || `Customer #${c.customer_id}`}
                      </A>
                    </Show>
                    <span class="ml-2 text-xs text-slate-400">
                      {c.customer_id ? `#${c.customer_id}` : `tenant ${c.tenant_id}`}
                    </span>
                  </td>
                  <td class="py-2 pr-2 text-xs text-slate-500">
                    {c.company_name || "—"}{c.company_code ? ` (${c.company_code})` : ""}
                  </td>
                  <td class="py-2 pr-2 text-right tabular-nums">{c.sessions}</td>
                  <td class="py-2 pr-2 text-right tabular-nums">{c.unique_users}</td>
                  <td class="py-2 pr-2 text-right tabular-nums">{c.page_views}</td>
                  <td class="py-2 pr-2 text-right tabular-nums">{fmtDuration(c.active_seconds)}</td>
                  <td class="py-2 text-right text-xs text-slate-500">
                    {c.last_activity_at ? new Date(c.last_activity_at).toLocaleString() : "—"}
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </section>

      <section class="rounded-xl border border-stroke bg-white p-4">
        <h2 class="text-sm font-semibold">Top pages</h2>
        <table class="mt-3 w-full text-left text-sm">
          <thead class="text-xs uppercase text-slate-500">
            <tr>
              <th class="py-2 pr-2">Page</th>
              <th class="py-2 pr-2">Pattern</th>
              <th class="py-2 pr-2 text-right">Views</th>
              <th class="py-2 text-right">Active time</th>
            </tr>
          </thead>
          <tbody>
            <For each={topPages()} fallback={
              <tr><td colSpan={4} class="py-4 text-text-secondary">No page views yet.</td></tr>
            }>
              {(p) => (
                <tr class="border-t border-stroke/60">
                  <td class="py-2 pr-2 font-medium">{p.page_label || "—"}</td>
                  <td class="py-2 pr-2 font-mono text-xs text-slate-500">{p.route_pattern}</td>
                  <td class="py-2 pr-2 text-right tabular-nums">{p.views}</td>
                  <td class="py-2 text-right tabular-nums">{fmtDuration(p.active_seconds)}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
        <p class="mt-3 text-xs text-slate-500">
          Click a customer name above for that customer’s analytics (login/logout, inactivity, page journeys).
        </p>
      </section>
    </div>
  );
}
