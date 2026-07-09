import { For, Show, createSignal, onMount } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { formatPeso } from "../../shared/money";
import { apiAbsoluteUrl, apiFetch, getAccessToken } from "../../shared/api";
import { useToast } from "../../shared/toast";
import { LoadingText } from "../../shared/LoadingText";
import {
  useBilling,
  useBillingPayments,
  usePublicPlans,
  type BillingInvoice,
} from "../../shared/usePlatform";

export default function BillingPage() {
  const q = useBilling();
  const paymentsQ = useBillingPayments();
  const catalog = usePublicPlans();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [payingId, setPayingId] = createSignal<number | null>(null);

  onMount(() => {
    if (searchParams.paid === "1") {
      toast.success("Payment received. Your subscription will update shortly.");
    }
  });

  const payInvoice = async (inv: BillingInvoice) => {
    const id = inv.id;
    if (!id || payingId() !== null) return;
    setPayingId(id);
    const res = await apiFetch<{ checkout_url?: string }>(
      `/api/v1/platform/billing/invoices/${id}/checkout`,
      { method: "POST" },
      { silent: true },
    );
    setPayingId(null);
    if (!res.ok || !res.data?.checkout_url) {
      toast.error(res.message ?? "Could not start checkout.");
      return;
    }
    window.location.href = res.data.checkout_url;
  };

  const openPdf = async (inv: BillingInvoice) => {
    const id = inv.id;
    if (!id) return;
    const token = await getAccessToken();
    const url = apiAbsoluteUrl(`/api/v1/platform/billing/invoices/${id}/pdf`);
    const resp = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!resp.ok) {
      toast.error("Could not download invoice PDF.");
      return;
    }
    const blob = await resp.blob();
    const objectUrl = URL.createObjectURL(blob);
    window.open(objectUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div class="mx-auto max-w-3xl p-6">
      <h1 class="text-xl font-semibold text-text-primary">Billing & subscription</h1>
      <p class="mt-1 text-sm text-text-secondary">
        View your current plan, pay invoices online, and download PDF copies.
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
                              <p class="font-semibold">{formatPeso(p.regular_monthly_amount)}/mo</p>
                            }
                          >
                            <p class="font-semibold text-brand-700">{formatPeso(p.effective_monthly_amount)}/mo</p>
                            <p class="text-xs line-through text-text-secondary">
                              {formatPeso(p.regular_monthly_amount)}/mo
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
                    <th class="pb-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={q.data?.invoices ?? []}>
                    {(inv) => (
                      <tr class="border-t border-stroke">
                        <td class="py-2">{String(inv.invoice_no)}</td>
                        <td class="py-2">{String(inv.due_date).slice(0, 10)}</td>
                        <td class="py-2">{formatPeso(Number(inv.amount))}</td>
                        <td class="py-2">{String(inv.status)}</td>
                        <td class="py-2 text-right">
                          <div class="flex justify-end gap-2">
                            <Show when={inv.id}>
                              <button
                                type="button"
                                class="text-xs text-brand-600 hover:underline"
                                onClick={() => void openPdf(inv)}
                              >
                                PDF
                              </button>
                            </Show>
                            <Show when={inv.status === "issued" && inv.id}>
                              <button
                                type="button"
                                class="rounded bg-brand-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
                                disabled={payingId() === inv.id}
                                onClick={() => void payInvoice(inv)}
                              >
                                {payingId() === inv.id ? "Redirecting…" : "Pay now"}
                              </button>
                            </Show>
                          </div>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </Show>
          </div>

          <div class="rounded-xl border border-stroke bg-white p-5">
            <h2 class="text-sm font-semibold">Payment history</h2>
            <Show when={paymentsQ.isPending} fallback={
              <Show when={(paymentsQ.data?.length ?? 0) > 0} fallback={
                <p class="mt-2 text-sm text-text-secondary">No payments recorded yet.</p>
              }>
                <table class="mt-3 w-full text-left text-sm">
                  <thead class="text-xs text-text-secondary">
                    <tr>
                      <th class="pb-2">Date</th>
                      <th class="pb-2">Invoice</th>
                      <th class="pb-2">Amount</th>
                      <th class="pb-2">Method</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={paymentsQ.data ?? []}>
                      {(p) => (
                        <tr class="border-t border-stroke">
                          <td class="py-2">{String(p.paid_at ?? "").slice(0, 10)}</td>
                          <td class="py-2">{String(p.invoice_no ?? p.invoice_id)}</td>
                          <td class="py-2">{formatPeso(Number(p.amount))}</td>
                          <td class="py-2 capitalize">{String(p.provider ?? "—")}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </Show>
            }>
              <p class="mt-2 text-sm text-text-secondary">Loading payments…</p>
            </Show>
          </div>

          <p class="text-xs text-text-secondary">
            Questions about billing? Email{" "}
            <a href="mailto:sales@bluearm.ph" class="text-brand-600 hover:underline">
              sales@bluearm.ph
            </a>
            .
          </p>
        </div>
      }>
        <LoadingText class="mt-4 text-sm text-text-secondary" as="p" />
      </Show>
    </div>
  );
}
