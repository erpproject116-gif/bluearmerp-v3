import { A, useParams } from "@solidjs/router";
import { For, Show, createSignal, onMount } from "solid-js";
import {
  usePlatformCustomer,
  usePlatformCustomerEngagement,
  usePlatformCustomerSession,
} from "../../shared/usePlatform";
import { LoadingText } from "../../shared/LoadingText";

function fmtWhen(v?: string | null): string {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

function fmtDuration(sec?: number | null): string {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return r ? `${m}m ${r}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}

export default function PlatformCustomerAnalyticsPage() {
  const params = useParams<{ id: string }>();
  const id = () => Number(params.id);
  const customerQ = usePlatformCustomer(id);
  const engagement = usePlatformCustomerEngagement(id);
  const [openSessionId, setOpenSessionId] = createSignal<number | null>(null);
  const sessionDetail = usePlatformCustomerSession(id, openSessionId);

  // #region agent log
  onMount(() => {
    fetch("http://127.0.0.1:7860/ingest/4e7a973e-c880-478e-9306-d7b0547d6f55", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "393b43" },
      body: JSON.stringify({
        sessionId: "393b43",
        runId: "post-fix",
        hypothesisId: "nav-customer-analytics",
        location: "PlatformCustomerAnalyticsPage.tsx:onMount",
        message: "opened customer analytics page",
        data: { customerId: id(), path: typeof window !== "undefined" ? window.location.pathname : "" },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  });
  // #endregion

  const c = () => customerQ.data?.customer as Record<string, unknown> | undefined;
  const eg = () => engagement.data;
  const name = () => {
    const row = c();
    if (!row) return `Customer #${id()}`;
    return String(row.full_name || row.company_name || row.email || `Customer #${id()}`);
  };

  return (
    <div class="space-y-6">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <A href={`/app/platform-command/customers/${id()}`} class="text-sm text-slate-500 hover:underline">
            ← {name()}
          </A>
          <h1 class="mt-1 text-xl font-semibold text-text-primary">Customer analytics</h1>
          <p class="text-sm text-text-secondary">
            Login/logout, inactivity, sessions, and page journeys for this customer — not the platform-wide report.
          </p>
        </div>
        <A href="/app/platform-command/analytics" class="text-xs text-brand-600 hover:underline">
          All customers analytics →
        </A>
      </div>

      <Show when={customerQ.isPending || engagement.isPending}>
        <LoadingText class="text-sm text-text-secondary" as="p" />
      </Show>
      <Show when={customerQ.isError || engagement.isError}>
        <p class="text-sm text-red-600">
          {(customerQ.error as Error)?.message ||
            (engagement.error as Error)?.message ||
            "Failed to load customer analytics."}
        </p>
      </Show>

      <Show when={eg()}>
        <section class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div class="rounded-xl border border-stroke bg-white p-4">
            <p class="text-xs uppercase text-slate-500">Last login</p>
            <p class="mt-1 text-lg font-semibold">{fmtWhen(eg()!.summary.last_login_at)}</p>
          </div>
          <div class="rounded-xl border border-stroke bg-white p-4">
            <p class="text-xs uppercase text-slate-500">Last logout</p>
            <p class="mt-1 text-lg font-semibold">{fmtWhen(eg()!.summary.last_logout_at)}</p>
            <p class="mt-1 text-xs text-slate-500">{eg()!.summary.last_end_reason || ""}</p>
          </div>
          <div class="rounded-xl border border-stroke bg-white p-4">
            <p class="text-xs uppercase text-slate-500">Last activity</p>
            <p class="mt-1 text-lg font-semibold">{fmtWhen(eg()!.summary.last_activity_at)}</p>
          </div>
          <div class="rounded-xl border border-stroke bg-white p-4">
            <p class="text-xs uppercase text-slate-500">Inactivity</p>
            <p class="mt-1 text-lg font-semibold">
              {eg()!.summary.inactive_seconds != null ? fmtDuration(eg()!.summary.inactive_seconds) : "—"}
            </p>
          </div>
        </section>

        <section class="rounded-xl border border-stroke bg-white p-4">
          <h2 class="text-sm font-semibold">Users</h2>
          <ul class="mt-2 divide-y divide-stroke text-sm">
            <For each={eg()!.users} fallback={<li class="py-2 text-text-secondary">No users.</li>}>
              {(u) => (
                <li class="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <p class="font-medium">{u.full_name || u.email}</p>
                    <p class="text-xs text-slate-500">{u.email}</p>
                  </div>
                  <div class="text-right text-xs text-slate-500">
                    <p>In: {fmtWhen(u.last_login_at)}</p>
                    <p>Out: {fmtWhen(u.last_logout_at)} {u.last_end_reason ? `(${u.last_end_reason})` : ""}</p>
                    <p>Idle: {u.inactive_seconds != null ? fmtDuration(u.inactive_seconds) : "—"}</p>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </section>

        <section class="rounded-xl border border-stroke bg-white p-4">
          <h2 class="text-sm font-semibold">Recent sessions</h2>
          <ul class="mt-3 space-y-2 text-sm">
            <For each={eg()!.sessions} fallback={<li class="text-text-secondary">No sessions recorded yet.</li>}>
              {(s) => (
                <li class="rounded-lg border border-stroke p-3">
                  <div class="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p class="font-medium">{s.user_name}</p>
                      <p class="text-xs text-slate-500">
                        {fmtWhen(s.started_at)} → {s.ended_at ? fmtWhen(s.ended_at) : "open"}
                        {s.end_reason ? ` · ${s.end_reason}` : ""}
                        {s.end_exact === false && s.end_reason ? " (inferred)" : ""}
                      </p>
                      <p class="text-xs text-slate-500">
                        Active {fmtDuration(s.active_seconds)} · Idle {fmtDuration(s.idle_seconds)} · {s.page_view_count} pages
                      </p>
                    </div>
                    <button
                      type="button"
                      class="text-xs font-medium text-brand-600 hover:underline"
                      onClick={() => setOpenSessionId(openSessionId() === s.id ? null : s.id)}
                    >
                      {openSessionId() === s.id ? "Hide journey" : "Page journey"}
                    </button>
                  </div>
                  <Show when={openSessionId() === s.id}>
                    <Show when={sessionDetail.isFetching}>
                      <LoadingText class="mt-2 text-xs text-text-secondary" as="p" />
                    </Show>
                    <ol class="mt-2 space-y-1 border-t border-stroke pt-2 text-xs">
                      <For each={sessionDetail.data?.pages ?? []}>
                        {(p) => (
                          <li class="flex flex-wrap justify-between gap-2">
                            <span>
                              <span class="font-medium">{p.page_label || p.route_pattern}</span>
                              <span class="ml-2 text-slate-400">{p.route_pattern}</span>
                            </span>
                            <span class="tabular-nums text-slate-500">
                              {fmtDuration(p.active_seconds)}
                              {p.idle_seconds ? ` (+${fmtDuration(p.idle_seconds)} idle)` : ""}
                            </span>
                          </li>
                        )}
                      </For>
                    </ol>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>
    </div>
  );
}
