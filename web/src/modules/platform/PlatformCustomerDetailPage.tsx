import { useParams } from "@solidjs/router";
import { formatPeso } from "../../shared/money";
import { createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { usePlatformCustomer, usePlatformPlansAdmin, type PlatformPlan } from "../../shared/usePlatform";



function planLabel(p: PlatformPlan) {
  const price = p.promo_active ? p.effective_monthly_amount : p.regular_monthly_amount;
  return `${p.display_name} — ${formatPeso(price)}/mo`;
}

export default function PlatformCustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = () => Number(params.id);
  const q = usePlatformCustomer(id);
  const plansQ = usePlatformPlansAdmin();
  const [busy, setBusy] = createSignal(false);

  const paidPlans = () =>
    (plansQ.data ?? []).filter((p) => p.is_active && !p.plan_code.includes("trial") && !p.plan_code.includes("demo"));

  const act = async (path: string, body?: object) => {
    setBusy(true);
    await apiFetch(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
    await q.refetch();
    setBusy(false);
  };

  return (
    <div class="mx-auto max-w-4xl p-6">
      <Show when={q.isPending} fallback={
        <Show when={q.data} fallback={<p class="text-sm text-red-600">Customer not found.</p>}>
          {(d) => {
            const c = () => d().customer as Record<string, unknown>;
            return (
              <div class="space-y-6">
                <div>
                  <h1 class="text-xl font-semibold">{String(c().full_name || c().email)}</h1>
                  <p class="text-sm text-text-secondary">{String(c().email)}</p>
                  <p class="mt-1 text-xs">
                    Urgency: <strong>{String(c().urgency_label)}</strong> · Source: {String(c().entry_source)}
                  </p>
                </div>

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
                            {String(inv.invoice_no)} · ₱{Number(inv.amount).toLocaleString()} · {String(inv.status)}
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
        <p class="text-sm text-text-secondary">Loading…</p>
      </Show>
    </div>
  );
}
