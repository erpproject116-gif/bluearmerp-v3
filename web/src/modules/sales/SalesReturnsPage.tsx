import { createQuery } from "@tanstack/solid-query";
import { For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";

type SalesReturnRow = {
  id: number;
  return_no: string;
  return_date: string;
  sales_id: number;
  status: string;
  grand_total: number;
};

export default function SalesReturnsPage() {
  const list = createQuery(() => ({
    queryKey: ["sales-returns"],
    queryFn: async () => {
      const res = await apiFetch<SalesReturnRow[]>("/api/v1/sales/sales-returns?pageSize=50");
      if (!res.success) throw new Error(res.message ?? "Failed to load");
      return res.data ?? [];
    },
  }));

  return (
    <div class="space-y-4">
      <h1 class="text-xl font-semibold text-slate-900">Sales Returns</h1>
      <Show when={!list.isLoading} fallback={<p class="text-sm text-slate-500">Loading…</p>}>
        <table class="min-w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
          <thead class="bg-slate-50">
            <tr>
              <th class="px-3 py-2 text-left">Return No</th>
              <th class="px-3 py-2 text-left">Date</th>
              <th class="px-3 py-2 text-left">Sales ID</th>
              <th class="px-3 py-2 text-left">Status</th>
              <th class="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            <For each={list.data ?? []}>
              {(row) => (
                <tr class="border-t border-slate-100">
                  <td class="px-3 py-2">{row.return_no}</td>
                  <td class="px-3 py-2">{row.return_date}</td>
                  <td class="px-3 py-2">{row.sales_id}</td>
                  <td class="px-3 py-2">{row.status}</td>
                  <td class="px-3 py-2 text-right">{row.grand_total.toFixed(2)}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Show>
    </div>
  );
}
