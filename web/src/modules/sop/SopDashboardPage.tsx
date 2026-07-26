import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import { useSopDashboard, useSopDocuments } from "../../shared/useSop";

export default function SopDashboardPage() {
  const dash = useSopDashboard();
  const stale = useSopDocuments(() => ({ page: 1, pageSize: 50, status: "published" }));
  const summary = () => dash.data;

  return (
    <div>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-lg font-semibold text-text-primary">SOP dashboard</h1>
          <p class="text-sm text-text-secondary">
            Stale = published and last reviewed more than {summary()?.stale_days ?? 180} days ago.
          </p>
        </div>
        <A href="/app/sop" class="text-sm font-medium text-brand-600 hover:underline">
          Library
        </A>
      </div>

      <Show when={dash.isError}>
        <p class="mb-3 text-sm text-red-600">{(dash.error as Error)?.message}</p>
      </Show>

      <div class="mb-4 grid gap-3 sm:grid-cols-3">
        <div class="rounded-xl border border-stroke bg-white p-4">
          <p class="text-xs text-text-secondary">Stale published</p>
          <p class="mt-1 text-2xl font-semibold text-amber-700">{summary()?.stale_count ?? 0}</p>
        </div>
        <div class="rounded-xl border border-stroke bg-white p-4">
          <p class="mb-2 text-xs text-text-secondary">By status</p>
          <For each={summary()?.by_status ?? []}>
            {(row) => (
              <p class="text-sm capitalize">
                {row.key}: <span class="font-medium">{row.count}</span>
              </p>
            )}
          </For>
        </div>
        <div class="rounded-xl border border-stroke bg-white p-4">
          <p class="mb-2 text-xs text-text-secondary">By category</p>
          <For each={summary()?.by_category ?? []}>
            {(row) => (
              <p class="text-sm capitalize">
                {row.key}: <span class="font-medium">{row.count}</span>
              </p>
            )}
          </For>
        </div>
      </div>

      <section class="rounded-xl border border-stroke bg-white p-4">
        <h2 class="mb-3 text-sm font-semibold">Published needing review</h2>
        <ul class="space-y-2 text-sm">
          <For each={(stale.data?.rows ?? []).filter((r) => r.stale)}>
            {(row) => (
              <li>
                <A href={`/app/sop/documents/${row.id}`} class="text-brand-600 hover:underline">
                  {row.title}
                </A>
                <span class="ml-2 text-text-secondary">reviewed {row.reviewed_at}</span>
              </li>
            )}
          </For>
        </ul>
        <Show when={(stale.data?.rows ?? []).filter((r) => r.stale).length === 0}>
          <p class="text-sm text-text-secondary">No stale published SOPs.</p>
        </Show>
      </section>
    </div>
  );
}
