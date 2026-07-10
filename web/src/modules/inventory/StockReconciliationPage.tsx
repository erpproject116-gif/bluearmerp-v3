import { createSignal, For, Show } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { uiLabel } from "../../shared/branding/uiLabel";

type ReconciliationCategory = {
  code: string;
  label: string;
  count: number;
  api: string;
};

type Summary = {
  total_count: number;
  categories: ReconciliationCategory[];
};

export default function StockReconciliationPage() {
  const [expanded, setExpanded] = createSignal<string | null>(null);
  const [detailRows, setDetailRows] = createSignal<unknown[]>([]);
  const [detailLoading, setDetailLoading] = createSignal(false);

  const summary = createQuery(() => ({
    queryKey: ["reconciliation-summary"],
    queryFn: async () => {
      const res = await apiFetch<Summary>("/api/v1/inventory/reconciliation/summary");
      if (!res.success) throw new Error(res.message ?? "Failed to load");
      return res.data ?? { total_count: 0, categories: [] };
    },
  }));

  const loadDetail = async (cat: ReconciliationCategory) => {
    if (expanded() === cat.code) {
      setExpanded(null);
      setDetailRows([]);
      return;
    }
    setExpanded(cat.code);
    setDetailLoading(true);
    const res = await apiFetch<unknown[]>(`/api/v1/inventory/reconciliation/${cat.api}?pageSize=50`);
    setDetailLoading(false);
    setDetailRows(res.success ? (res.data ?? []) : []);
  };

  return (
    <div class="space-y-4">
      <div>
        <h1 class="text-xl font-semibold text-slate-900">Stock Reconciliation</h1>
        <p class="mt-1 text-sm text-slate-600">
          Read-only mismatch report across serials, sales order fulfillment, goods receipts, and accounts payable.
        </p>
      </div>

      <Show when={!summary.isLoading} fallback={<p class="text-sm text-slate-500">{uiLabel("common.loading")}</p>}>
        <div class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p class="text-sm text-slate-700">
            Total gaps: <strong class={summary.data?.total_count ? "text-red-700" : "text-emerald-700"}>{summary.data?.total_count ?? 0}</strong>
          </p>
        </div>

        <ul class="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white shadow-sm">
          <For each={summary.data?.categories ?? []}>
            {(cat) => (
              <li>
                <button
                  type="button"
                  class="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-slate-50"
                  onClick={() => void loadDetail(cat)}
                >
                  <span>{cat.label}</span>
                  <span class={cat.count > 0 ? "font-semibold text-red-700" : "text-slate-500"}>{cat.count}</span>
                </button>
                <Show when={expanded() === cat.code}>
                  <div class="border-t border-slate-100 bg-slate-50 px-4 py-3">
                    <Show when={detailLoading()} fallback={
                      <Show
                        when={detailRows().length > 0}
                        fallback={<p class="text-xs text-slate-500">No rows (or category is clear).</p>}
                      >
                        <pre class="max-h-64 overflow-auto text-xs text-slate-800">{JSON.stringify(detailRows(), null, 2)}</pre>
                      </Show>
                    }>
                      <p class="text-xs text-slate-500">Loading detail…</p>
                    </Show>
                  </div>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}
