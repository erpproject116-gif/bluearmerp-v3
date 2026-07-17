import { For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { usePlatformOnboardingQueue } from "../../shared/usePlatform";

export default function PlatformOnboardingPage() {
  const queue = usePlatformOnboardingQueue();
  return (
    <div class="space-y-4">
      <div>
        <h2 class="text-xl font-semibold">Onboarding operations</h2>
        <p class="mt-1 text-sm text-slate-500">Foundation and adoption progress across linked tenants.</p>
      </div>
      <div class="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table class="min-w-full text-left text-sm">
          <thead class="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th class="px-3 py-2">Customer</th>
              <th class="px-3 py-2">Workspace</th>
              <th class="px-3 py-2">Progress</th>
              <th class="px-3 py-2">Blocker</th>
              <th class="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            <Show when={queue.isLoading}>
              <tr><td class="px-3 py-4 text-slate-500" colspan="5">Loading…</td></tr>
            </Show>
            <For each={queue.data ?? []}>
              {(c) => (
                <tr class="border-t border-slate-100">
                  <td class="px-3 py-2">
                    <p class="font-medium">{c.company_name || c.full_name}</p>
                    <p class="text-xs text-slate-500">{c.email}</p>
                  </td>
                  <td class="px-3 py-2">{c.company_code}</td>
                  <td class="px-3 py-2 tabular-nums">{c.overall_percent ?? 0}%</td>
                  <td class="px-3 py-2 text-slate-600">{c.blocking_reason || (c.ready ? "Ready" : "—")}</td>
                  <td class="px-3 py-2 text-right">
                    <A href={`/app/platform-command/customers/${c.customer_id}`} class="text-xs font-medium text-brand-700 hover:underline">
                      Open
                    </A>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </div>
  );
}
