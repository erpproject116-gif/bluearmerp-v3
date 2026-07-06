import { For, Show } from "solid-js";
import { useBilling, usePublicPlans } from "../../shared/usePlatform";

function money(n: number) {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BillingPage() {
  const q = useBilling();
  const catalog = usePublicPlans();

  return (
    <div class="mx-auto max-w-3xl p-6">
      <h1 class="text-xl font-semibold text-text-primary">Billing & subscription</h1>
      <p class="mt-1 text-sm text-text-secondary">
        View your current plan, available packages, and invoices. Contact sales to upgrade or renew.
      </p>

      <Show when={q.isPending && catalog.isPending} fallback={
        <div class="mt-6 space-y-6">
          <div class="rounded-xl border border-stroke bg-white p-5">
            <h2 class="text-sm font-semibold">Current plan</h2>
            <Show
              when={q.data?.subscription}
              fallback={<p class="mt-2 text-sm text-text-secondary">{q.data?.message ?? "No subscription on file."}</p>}
            >
              {(sub) => (
                <dl class="mt-3 grid gap-2 text-sm">
                  <div>
                    <dt class="text-text-secondary">Plan</dt>
                    <dd class="font-medium">{String(sub().plan_kind)}</dd>
                  </div>
                  <div>
                    <dt class="text-text-secondary">Status</dt>
                    <dd>{String(sub().status)}</dd>
                  </div>
                  <Show when={sub().ends_at}>
                    <div>
                      <dt class="text-text-secondary">Valid until</dt>
                      <dd>{String(sub().ends_at).slice(0, 10)}</dd>
                    </div>
                  </Show>
                </dl>
              )}
            </Show>
          </div>

          <Show when={(catalog.data?.length ?? 0) > 0}>
            <div class="rounded-xl border border-stroke bg-white p-5">
              <h2 class="text-sm font-semibold">Available plans</h2>
              <div class="mt-4 space-y-4">
                <For each={catalog.data}>
                  {(p) => (
                    <div class="rounded-lg border border-stroke p-4">
                      <div class="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h3 class="font-medium text-text-primary">{p.display_name}</h3>
                          <p class="mt-1 text-xs text-text-secondary">{p.description}</p>
                        </div>
                        <div class="text-right text-sm">
                          <Show
                            when={p.promo_active}
                            fallback={
                              <p class="font-semibold">₱{money(p.regular_monthly_amount)}/mo</p>
                            }
                          >
                            <p class="font-semibold text-brand-700">₱{money(p.effective_monthly_amount)}/mo</p>
                            <p class="text-xs line-through text-text-secondary">
                              ₱{money(p.regular_monthly_amount)}/mo
                            </p>
                            <Show when={p.promo_label}>
                              <p class="text-xs text-amber-700">{p.promo_label}</p>
                            </Show>
                          </Show>
                          <Show when={p.lock_in_months > 0}>
                            <p class="text-xs text-text-secondary">{p.lock_in_months}-month term</p>
                          </Show>
                        </div>
                      </div>
                      <Show when={Array.isArray(p.inclusions) && (p.inclusions as string[]).length > 0}>
                        <ul class="mt-3 list-inside list-disc text-xs text-text-secondary">
                          <For each={p.inclusions as string[]}>{(inc) => <li>{inc}</li>}</For>
                        </ul>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>

          <div class="rounded-xl border border-stroke bg-white p-5">
            <h2 class="text-sm font-semibold">Invoices</h2>
            <Show when={(q.data?.invoices?.length ?? 0) > 0} fallback={
              <p class="mt-2 text-sm text-text-secondary">No invoices yet.</p>
            }>
              <table class="mt-3 w-full text-left text-sm">
                <thead class="text-xs text-text-secondary">
                  <tr>
                    <th class="pb-2">Invoice</th>
                    <th class="pb-2">Due</th>
                    <th class="pb-2">Amount</th>
                    <th class="pb-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={q.data?.invoices ?? []}>
                    {(inv) => (
                      <tr class="border-t border-stroke">
                        <td class="py-2">{String(inv.invoice_no)}</td>
                        <td class="py-2">{String(inv.due_date).slice(0, 10)}</td>
                        <td class="py-2">₱{Number(inv.amount).toLocaleString()}</td>
                        <td class="py-2">{String(inv.status)}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </Show>
          </div>

          <p class="text-xs text-text-secondary">
            To subscribe or renew at a listed price, email{" "}
            <a href="mailto:sales@bluearm.ph" class="text-brand-600 hover:underline">
              sales@bluearm.ph
            </a>{" "}
            with your company name and preferred plan.
          </p>
        </div>
      }>
        <p class="mt-4 text-sm text-text-secondary">Loading…</p>
      </Show>
    </div>
  );
}
