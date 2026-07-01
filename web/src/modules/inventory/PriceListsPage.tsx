import { createQuery } from "@tanstack/solid-query";
import { For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";

type PriceListRow = { id: number; name: string; is_selling: boolean; is_active: boolean };

export default function PriceListsPage() {
  const list = createQuery(() => ({
    queryKey: ["price-lists"],
    queryFn: async () => {
      const res = await apiFetch<PriceListRow[]>("/api/v1/inventory/price-lists");
      if (!res.success) throw new Error(res.message ?? "Failed to load");
      return res.data ?? [];
    },
  }));

  return (
    <div class="space-y-4">
      <h1 class="text-xl font-semibold text-slate-900">Price List</h1>
      <p class="text-sm text-slate-600">Selling price lists assigned to customers drive default rates on quotations and invoices.</p>
      <Show when={!list.isLoading} fallback={<p class="text-sm text-slate-500">Loading…</p>}>
        <ul class="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          <For each={list.data ?? []}>
            {(pl) => (
              <li class="flex justify-between px-4 py-3 text-sm">
                <span>{pl.name}</span>
                <span class="text-slate-500">{pl.is_selling ? "Selling" : "Buying"} · {pl.is_active ? "Active" : "Inactive"}</span>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}
