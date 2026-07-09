import { A } from "@solidjs/router";
import { formatPeso } from "../../shared/money";
import { For, Show } from "solid-js";
import { usePlatformPlansAdmin } from "../../shared/usePlatform";
import { LoadingText } from "../../shared/LoadingText";



export default function PlatformPlansPage() {
  const q = usePlatformPlansAdmin();
  return (
    <div class="mx-auto max-w-5xl p-6">
      <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 class="text-xl font-semibold text-text-primary">Subscription plans & pricing</h1>
          <p class="text-sm text-text-secondary">
            Manage tiers, regular and promo prices, inclusions, and what tenants see on billing.
          </p>
        </div>
        <A
          href="/app/platform/plans/new"
          class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          New plan
        </A>
      </div>

      <Show when={q.isPending} fallback={
        <Show when={q.isError} fallback={
          <div class="space-y-4">
            <For each={q.data ?? []}>
              {(p) => (
                <div class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div class="flex items-center gap-2">
                        <h2 class="font-semibold text-text-primary">{p.display_name}</h2>
                        <Show when={!p.is_active}>
                          <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Inactive</span>
                        </Show>
                        <Show when={p.promo_active}>
                          <span class="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                            Promo: {p.promo_label || "Active"}
                          </span>
                        </Show>
                      </div>
                      <p class="mt-1 text-xs text-text-secondary">{p.plan_code}</p>
                      <p class="mt-2 text-sm text-text-secondary">{p.description}</p>
                    </div>
                    <A
                      href={`/app/platform/plans/${p.id}`}
                      class="text-sm font-medium text-brand-600 hover:underline"
                    >
                      Edit
                    </A>
                  </div>

                  <div class="mt-4 grid gap-4 sm:grid-cols-2">
                    <div class="rounded-lg bg-slate-50 p-3 text-sm">
                      <p class="text-xs font-medium uppercase text-text-secondary">Regular price</p>
                      <p class="mt-1 text-lg font-semibold">{formatPeso(p.regular_monthly_amount)}/mo</p>
                      <Show when={p.regular_total_amount != null}>
                        <p class="text-xs text-text-secondary">Contract: {formatPeso(p.regular_total_amount!)}</p>
                      </Show>
                    </div>
                    <div class="rounded-lg bg-slate-50 p-3 text-sm">
                      <p class="text-xs font-medium uppercase text-text-secondary">Effective price</p>
                      <Show
                        when={p.promo_active && p.promo_monthly_amount != null}
                        fallback={<p class="mt-1 text-lg font-semibold">{formatPeso(p.effective_monthly_amount)}/mo</p>}
                      >
                        <p class="mt-1 text-lg font-semibold text-brand-700">
                          {formatPeso(p.effective_monthly_amount)}/mo
                        </p>
                        <p class="text-xs line-through text-text-secondary">
                          Was {formatPeso(p.regular_monthly_amount)}/mo
                        </p>
                      </Show>
                      <Show when={p.lock_in_months > 0}>
                        <p class="text-xs text-text-secondary">{p.lock_in_months}-month lock-in</p>
                      </Show>
                    </div>
                  </div>

                  <Show when={Array.isArray(p.inclusions) && (p.inclusions as string[]).length > 0}>
                    <ul class="mt-4 list-inside list-disc text-sm text-text-secondary">
                      <For each={p.inclusions as string[]}>{(inc) => <li>{inc}</li>}</For>
                    </ul>
                  </Show>
                </div>
              )}
            </For>
          </div>
        }>
          <p class="text-sm text-red-600">Failed to load plans.</p>
        </Show>
      }>
        <LoadingText class="text-sm text-text-secondary" as="p" />
      </Show>
    </div>
  );
}
