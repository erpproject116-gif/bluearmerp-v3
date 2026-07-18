import { A, useParams } from "@solidjs/router";
import { formatPeso } from "../../shared/money";
import { createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import {
  usePlatformCustomer,
  usePlatformCustomerEngagement,
  usePlatformCustomerOverview,
  usePlatformCustomerSession,
  usePlatformPlansAdmin,
  type PlatformPlan,
} from "../../shared/usePlatform";
import { LoadingText } from "../../shared/LoadingText";

function planLabel(p: PlatformPlan) {
  const price = p.promo_active ? p.effective_monthly_amount : p.regular_monthly_amount;
  return `${p.display_name} — ${formatPeso(price)}/mo`;
}

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

export default function PlatformCustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = () => Number(params.id);
  const q = usePlatformCustomer(id);
  const overview = usePlatformCustomerOverview(id);
  const engagement = usePlatformCustomerEngagement(id);
  const plansQ = usePlatformPlansAdmin();
  const [busy, setBusy] = createSignal(false);
  const [openSessionId, setOpenSessionId] = createSignal<number | null>(null);
  const sessionDetail = usePlatformCustomerSession(id, openSessionId);

  const paidPlans = () =>
    (plansQ.data ?? []).filter((p) => p.is_active && !p.plan_code.includes("trial") && !p.plan_code.includes("demo"));

  const act = async (path: string, body?: object) => {
    setBusy(true);
    await apiFetch(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
    await q.refetch();
    setBusy(false);
  };

  return (
    <div class="space-y-6">
      <A href="/app/platform-command/customers" class="text-sm text-slate-500 hover:underline">← Customers</A>
      <Show when={q.isPending} fallback={
        <Show when={q.data} fallback={<p class="text-sm text-red-600">Customer not found.</p>}>
          {(d) => {
            const c = () => d().customer as Record<string, unknown>;
            const ov = () => overview.data;
            const eg = () => engagement.data;
            return (
              <div class="space-y-6">
                <div>
                  <h1 class="text-xl font-semibold">{String(c().full_name || c().email)}</h1>
                  <p class="text-sm text-text-secondary">{String(c().email)}</p>
                  <p class="mt-1 text-xs">
                    Urgency: <strong>{String(c().urgency_label)}</strong> · Source: {String(c().entry_source)}
                  </p>
                </div>

                <Show when={ov()}>
                  <section class="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
                    <div>
                      <p class="text-xs uppercase text-slate-500">Workspace</p>
                      <p class="font-medium">{ov()?.tenant?.company_name || "—"} ({ov()?.tenant?.company_code || "n/a"})</p>
                      <p class="text-xs text-slate-500">{ov()?.tenant?.user_count ?? 0} users · {ov()?.tenant?.open_tickets ?? 0} open tickets</p>
                    </div>
                    <div>
                      <p class="text-xs uppercase text-slate-500">Onboarding</p>
                      <p class="font-medium tabular-nums">{ov()?.onboarding?.overall_percent ?? ov()?.onboarding?.percent ?? 0}%</p>
                      <p class="text-xs text-slate-500">{ov()?.onboarding?.blocking_reason || (ov()?.onboarding?.ready ? "Ready" : "In progress")}</p>
                    </div>
                    <div>
                      <p class="text-xs uppercase text-slate-500">Presence</p>
                      <p class="font-medium text-sm">{ov()?.tenant?.current_screen || "Offline / unknown"}</p>
                      <p class="text-xs text-slate-500">
                        {ov()?.tenant?.last_seen_at ? `Last seen ${new Date(ov()!.tenant.last_seen_at).toLocaleString()}` : "No recent presence"}
                      </p>
                    </div>
                  </section>
                </Show>

                <section class="rounded-xl border border-stroke bg-white p-4">
                  <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 class="text-sm font-semibold">Engagement</h2>
                    <A
                      href={`/app/platform-command/customers/${id()}/analytics`}
                      class="text-xs text-brand-600 hover:underline"
                    >
                      View analytics →
                    </A>
                  </div>
                  <Show when={engagement.isPending}>
                    <LoadingText class="text-sm text-text-secondary" as="p" />
                  </Show>
                  <Show when={eg()}>
                    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <p class="text-xs uppercase text-slate-500">Last login</p>
                        <p class="text-sm font-medium">{fmtWhen(eg()!.summary.last_login_at)}</p>
                      </div>
                      <div>
                        <p class="text-xs uppercase text-slate-500">Last logout</p>
                        <p class="text-sm font-medium">{fmtWhen(eg()!.summary.last_logout_at)}</p>
                        <p class="text-xs text-slate-500">{eg()!.summary.last_end_reason || ""}</p>
                      </div>
                      <div>
                        <p class="text-xs uppercase text-slate-500">Last activity</p>
                        <p class="text-sm font-medium">{fmtWhen(eg()!.summary.last_activity_at)}</p>
                      </div>
                      <div>
                        <p class="text-xs uppercase text-slate-500">Inactivity</p>
                        <p class="text-sm font-medium">
                          {eg()!.summary.inactive_seconds != null ? fmtDuration(eg()!.summary.inactive_seconds) : "—"}
                        </p>
                      </div>
                    </div>

                    <h3 class="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Users</h3>
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

                    <h3 class="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Recent sessions</h3>
                    <ul class="mt-2 space-y-2 text-sm">
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
                  </Show>
                </section>

                <div>
                  <p class="mb-2 text-xs font-medium uppercase text-text-secondary">Activate paid plan</p>
                  <div class="flex flex-wrap gap-2">
                    <For each={paidPlans()}>
                      {(p) => (
                        <button
                          type="button"
                          disabled={busy()}
                          class="rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
                          onClick={() =>
                            void act(`/api/v1/platform/console/customers/${id()}/subscriptions`, {
                              plan_id: p.id,
                              plan_kind: p.plan_code,
                            })
                          }
                        >
                          {planLabel(p)}
                          <Show when={p.promo_active}>
                            <span class="ml-1 opacity-90">(promo)</span>
                          </Show>
                        </button>
                      )}
                    </For>
                  </div>
                </div>

                <div class="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy()}
                    class="rounded-lg border border-stroke px-3 py-2 text-xs"
                    onClick={() => void act(`/api/v1/platform/console/customers/${id()}/extend-trial`, { days: 30 })}
                  >
                    Extend trial 30d
                  </button>
                  <button
                    type="button"
                    disabled={busy()}
                    class="rounded-lg border border-stroke px-3 py-2 text-xs"
                    onClick={() => void act(`/api/v1/platform/console/customers/${id()}/convert-demo`)}
                  >
                    Convert demo → trial
                  </button>
                </div>

                <section>
                  <h2 class="text-sm font-semibold">Subscriptions</h2>
                  <ul class="mt-2 space-y-2 text-sm">
                    <For each={d().subscriptions as Record<string, unknown>[]}>
                      {(s) => (
                        <li class="rounded-lg border border-stroke p-3">
                          {String(s.plan_kind)} · {String(s.status)}
                          {s.ends_at ? ` · ends ${String(s.ends_at).slice(0, 10)}` : ""}
                          · {formatPeso(Number(s.monthly_amount) || 0)}/mo
                          <button
                            type="button"
                            class="ml-3 text-xs text-brand-600 hover:underline"
                            onClick={() => {
                              const today = new Date().toISOString().slice(0, 10);
                              void act(`/api/v1/platform/console/subscriptions/${s.id}/invoices`, {
                                period_start: today,
                                period_end: today,
                                due_date: today,
                                amount: Number(s.monthly_amount) || undefined,
                              });
                            }}
                          >
                            Issue invoice
                          </button>
                        </li>
                      )}
                    </For>
                  </ul>
                </section>

                <section>
                  <h2 class="text-sm font-semibold">Invoices</h2>
                  <ul class="mt-2 space-y-2 text-sm">
                    <For each={d().invoices as Record<string, unknown>[]}>
                      {(inv) => (
                        <li class="flex items-center justify-between rounded-lg border border-stroke p-3">
                          <span>
                            {String(inv.invoice_no)} · {formatPeso(Number(inv.amount) || 0)} · {String(inv.status)}
                          </span>
                          <Show when={inv.status === "issued"}>
                            <button
                              type="button"
                              class="text-xs text-brand-600 hover:underline"
                              onClick={() => void act(`/api/v1/platform/console/invoices/${inv.id}/mark-paid`)}
                            >
                              Mark paid
                            </button>
                          </Show>
                        </li>
                      )}
                    </For>
                  </ul>
                </section>
              </div>
            );
          }}
        </Show>
      }>
        <LoadingText class="text-sm text-text-secondary" as="p" />
      </Show>
    </div>
  );
}
