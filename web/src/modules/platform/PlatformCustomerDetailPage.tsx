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
  const [wipeOpen, setWipeOpen] = createSignal(false);
  const [wipeCode, setWipeCode] = createSignal("");
  const [wipeAck, setWipeAck] = createSignal(false);
  const [wipeBlockers, setWipeBlockers] = createSignal<string[]>([]);
  const [wipeCan, setWipeCan] = createSignal(true);
  const sessionDetail = usePlatformCustomerSession(id, openSessionId);

  const paidPlans = () =>
    (plansQ.data ?? []).filter((p) => p.is_active && !p.plan_code.includes("trial") && !p.plan_code.includes("demo"));

  const act = async (path: string, body?: object) => {
    setBusy(true);
    const res = await apiFetch(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }, { silent: true });
    await q.refetch();
    setBusy(false);
    return res;
  };

  const openWipe = async () => {
    setWipeCode("");
    setWipeAck(false);
    setWipeBlockers([]);
    setWipeCan(true);
    setBusy(true);
    const res = await apiFetch<{
      can_wipe?: boolean;
      blockers?: string[];
      company_code?: string;
    }>(`/api/v1/platform/console/customers/${id()}/wipe-preflight`, undefined, { silent: true });
    setBusy(false);
    if (!res.ok) {
      window.alert(res.message ?? "Wipe preflight failed.");
      return;
    }
    setWipeCan(Boolean(res.data?.can_wipe));
    setWipeBlockers(res.data?.blockers ?? []);
    setWipeOpen(true);
  };

  const runWipe = async () => {
    const code = String((q.data?.customer as Record<string, unknown> | undefined)?.company_code ?? "");
    if (!wipeAck() || wipeCode().trim() !== code) {
      window.alert("Type the exact company code and acknowledge irreversible wipe.");
      return;
    }
    if (!wipeCan()) {
      window.alert("Wipe is blocked by schema preflight.");
      return;
    }
    if (!confirm(`Permanently delete all business data for ${code}? This cannot be undone.`)) return;
    setBusy(true);
    const res = await apiFetch(
      `/api/v1/platform/console/customers/${id()}/wipe`,
      {
        method: "POST",
        body: JSON.stringify({
          confirm_company_code: wipeCode().trim(),
          acknowledge_irreversible: true,
        }),
      },
      { silent: true },
    );
    setBusy(false);
    if (!res.ok) {
      window.alert(res.message ?? "Wipe failed.");
      return;
    }
    setWipeOpen(false);
    await q.refetch();
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
                    <Show when={c().tenant_status}>
                      {" "}· Workspace: <strong>{String(c().tenant_status).replace(/_/g, " ")}</strong>
                      <Show when={c().company_code}> ({String(c().company_code)})</Show>
                    </Show>
                  </p>
                </div>

                <Show when={Boolean(c().likely_misjoin)}>
                  <div class="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950">
                    Likely mis-join: this email also has an open company invite on another workspace. Prefer rejecting
                    this self-serve signup and having them accept the invite, unless they truly need their own company.
                  </div>
                </Show>

                <Show when={String(c().tenant_status ?? "") === "pending_approval"}>
                  <div class="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p class="flex-1 text-sm text-amber-950">
                      Self-serve signup waiting for product owner approval before this company can use the ERP.
                    </p>
                    <button
                      type="button"
                      class="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                      disabled={busy()}
                      onClick={() => {
                        if (
                          c().likely_misjoin &&
                          !confirm(
                            "This email also has a pending invite on another company. Approve this separate workspace anyway?",
                          )
                        ) {
                          return;
                        }
                        void act(`/api/v1/platform/console/customers/${id()}/approve`);
                      }}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      class="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 disabled:opacity-50"
                      disabled={busy()}
                      onClick={() => void act(`/api/v1/platform/console/customers/${id()}/reject`, { reason: "Rejected by product owner" })}
                    >
                      Reject
                    </button>
                  </div>
                </Show>

                <Show when={String(c().tenant_status ?? "") === "active" || String(c().tenant_status ?? "") === "suspended"}>
                  <div class="space-y-3 rounded-xl border border-stroke bg-white p-4">
                    <h2 class="text-sm font-semibold text-text-primary">Workspace lifecycle</h2>
                    <p class="text-xs text-text-secondary">
                      Suspend keeps all business data and locks ERP access. Close &amp; wipe permanently deletes the
                      tenant and data; you can provision a new empty workspace for this customer afterward.
                    </p>
                    <div class="flex flex-wrap gap-2">
                      <Show when={String(c().tenant_status) === "active"}>
                        <button
                          type="button"
                          class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-950 disabled:opacity-50"
                          disabled={busy()}
                          onClick={() => {
                            if (!confirm("Suspend this workspace? Users lose ERP access; data is kept.")) return;
                            void act(`/api/v1/platform/console/customers/${id()}/suspend`);
                          }}
                        >
                          Suspend access
                        </button>
                      </Show>
                      <Show when={String(c().tenant_status) === "suspended"}>
                        <button
                          type="button"
                          class="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                          disabled={busy()}
                          onClick={() => void act(`/api/v1/platform/console/customers/${id()}/reactivate`)}
                        >
                          Reactivate
                        </button>
                      </Show>
                      <button
                        type="button"
                        class="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 disabled:opacity-50"
                        disabled={busy()}
                        onClick={() => void openWipe()}
                      >
                        Close &amp; wipe…
                      </button>
                    </div>
                  </div>
                </Show>

                <Show when={!c().tenant_id}>
                  <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
                    No workspace linked. Use <strong>Provision</strong> on the customers list (or create subscription /
                    provision flow) to create a new empty company for this email.
                  </div>
                </Show>

                <Show when={wipeOpen()}>
                  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div class="w-full max-w-md space-y-3 rounded-xl border border-stroke bg-white p-6 shadow-lg">
                      <h2 class="text-lg font-semibold text-red-800">Close &amp; wipe workspace</h2>
                      <p class="text-sm text-text-secondary">
                        Deletes tenant <strong>{String(c().company_code)}</strong> and all cascaded business data.
                        Customer lead is kept for re-provision.
                      </p>
                      <Show when={wipeBlockers().length > 0}>
                        <div class="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">
                          <p class="font-medium">Wipe blocked by FK preflight:</p>
                          <ul class="mt-1 list-disc pl-4">
                            <For each={wipeBlockers()}>{(b) => <li>{b}</li>}</For>
                          </ul>
                        </div>
                      </Show>
                      <label class="block text-sm">
                        Type company code to confirm
                        <input
                          class="mt-1 w-full rounded-lg border border-stroke px-3 py-2 text-sm"
                          value={wipeCode()}
                          onInput={(e) => setWipeCode(e.currentTarget.value)}
                          placeholder={String(c().company_code ?? "")}
                        />
                      </label>
                      <label class="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          class="mt-1"
                          checked={wipeAck()}
                          onChange={(e) => setWipeAck(e.currentTarget.checked)}
                        />
                        <span>I understand this is irreversible and business data will be destroyed.</span>
                      </label>
                      <div class="flex justify-end gap-2">
                        <button
                          type="button"
                          class="rounded-lg border border-stroke px-3 py-1.5 text-sm"
                          disabled={busy()}
                          onClick={() => setWipeOpen(false)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          class="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                          disabled={busy() || !wipeCan()}
                          onClick={() => void runWipe()}
                        >
                          Wipe permanently
                        </button>
                      </div>
                    </div>
                  </div>
                </Show>

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
