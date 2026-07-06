import { A } from "@solidjs/router";
import { createSignal, For, Show } from "solid-js";
import { usePlatformCustomers } from "../../shared/usePlatform";

const urgencyBadge: Record<string, string> = {
  trial_critical: "bg-red-100 text-red-800",
  trial_urgent: "bg-amber-100 text-amber-800",
  payment_overdue: "bg-red-100 text-red-800",
  new_lead: "bg-slate-100 text-slate-700",
};

export default function PlatformCustomersPage() {
  const [search, setSearch] = createSignal("");
  const q = usePlatformCustomers(search);
  return (
    <div class="mx-auto max-w-6xl p-6">
      <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 class="text-xl font-semibold text-text-primary">Platform customers</h1>
          <p class="text-sm text-text-secondary">Subscription registry and CRM traceability</p>
        </div>
        <input
          type="search"
          placeholder="Search email or company…"
          class="rounded-lg border border-stroke px-3 py-2 text-sm"
          value={search()}
          onInput={(e) => setSearch(e.currentTarget.value)}
        />
      </div>

      <Show when={q.isPending} fallback={
        <Show when={q.isError} fallback={
          <div class="overflow-hidden rounded-xl border border-stroke bg-white">
            <table class="w-full text-left text-sm">
              <thead class="border-b border-stroke bg-slate-50 text-xs uppercase text-text-secondary">
                <tr>
                  <th class="px-4 py-3">Customer</th>
                  <th class="px-4 py-3">Plan</th>
                  <th class="px-4 py-3">Urgency</th>
                  <th class="px-4 py-3">Days left</th>
                  <th class="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                <For each={q.data ?? []}>
                  {(c) => (
                    <tr class="border-b border-stroke last:border-0">
                      <td class="px-4 py-3">
                        <div class="font-medium">{c.full_name || c.email}</div>
                        <div class="text-xs text-text-secondary">{c.email}</div>
                      </td>
                      <td class="px-4 py-3">{c.plan_kind ?? "—"}</td>
                      <td class="px-4 py-3">
                        <span class={`rounded-full px-2 py-0.5 text-xs ${urgencyBadge[c.urgency_label] ?? "bg-slate-100"}`}>
                          {c.urgency_label.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td class="px-4 py-3">{c.days_remaining ?? "—"}</td>
                      <td class="px-4 py-3 text-right">
                        <A href={`/app/platform/customers/${c.id}`} class="text-brand-600 hover:underline">
                          View
                        </A>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        }>
          <p class="text-sm text-red-600">Failed to load customers.</p>
        </Show>
      }>
        <p class="text-sm text-text-secondary">Loading…</p>
      </Show>
    </div>
  );
}
