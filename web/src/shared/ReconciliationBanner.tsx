import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "./api";

type ReconciliationSummary = {
  total_count: number;
  categories: { code: string; label: string; count: number; api: string }[];
};

export function ReconciliationBanner(props: { compact?: boolean }) {
  const summary = createQuery(() => ({
    queryKey: ["reconciliation-summary"],
    queryFn: async () => {
      const res = await apiFetch<ReconciliationSummary>("/api/v1/inventory/reconciliation/summary");
      if (!res.success) throw new Error(res.message ?? "Failed to load reconciliation");
      return res.data!;
    },
    staleTime: 60_000,
  }));

  const issues = () => (summary.data?.categories ?? []).filter((c) => c.count > 0);

  return (
    <Show when={!summary.isLoading && (summary.data?.total_count ?? 0) > 0}>
      <div
        class={`rounded-xl border border-amber-200 bg-amber-50 ${props.compact ? "p-3" : "p-4"}`}
      >
        <p class="text-sm font-medium text-amber-900">
          {summary.data!.total_count} data issue{summary.data!.total_count === 1 ? "" : "s"} need attention
        </p>
        <ul class="mt-2 space-y-1 text-sm text-amber-800">
          <For each={issues()}>
            {(cat) => (
              <li>
                <A href="/app/inventory/stock-reconciliation" class="hover:underline">
                  {cat.label}: {cat.count}
                </A>
              </li>
            )}
          </For>
        </ul>
        <Show when={!props.compact}>
          <A href="/app/inventory/stock-reconciliation" class="mt-2 inline-block text-xs font-medium text-brand-700 hover:underline">
            Open stock reconciliation
          </A>
        </Show>
      </div>
    </Show>
  );
}
