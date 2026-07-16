import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { LookupCombo, type LookupOption } from "../../shared/LookupCombo";
import { RecordHistoryButton } from "../../shared/RecordHistoryButton";
import { useToast } from "../../shared/toast";

type PriceListRow = { id: number; name: string; is_selling: boolean; is_buying: boolean; is_active: boolean };
type PriceListItemRow = { item_id: number; item_code: string; item_name: string; rate: number };

async function fetchItems(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; item_code: string; item_name: string }[]>(
    `/api/v1/inventory/items?${qs}`,
  );
  return (res.data ?? []).map((i) => ({ id: i.id, label: `${i.item_code} — ${i.item_name}` }));
}

export default function PriceListsPage() {
  const toast = useToast();
  const client = useQueryClient();
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [newName, setNewName] = createSignal("");
  const [newListType, setNewListType] = createSignal<"selling" | "buying">("selling");
  const [listTypeFilter, setListTypeFilter] = createSignal<"all" | "selling" | "buying">("all");
  const [itemId, setItemId] = createSignal<number | null>(null);
  const [itemLabel, setItemLabel] = createSignal("");
  const [itemRate, setItemRate] = createSignal("");

  const list = createQuery(() => ({
    queryKey: ["price-lists"],
    queryFn: async () => {
      const res = await apiFetch<PriceListRow[]>("/api/v1/inventory/price-lists");
      if (!res.success) throw new Error(res.message ?? "Failed to load");
      return res.data ?? [];
    },
  }));

  const items = createQuery(() => ({
    queryKey: ["price-list-items", selectedId()],
    enabled: selectedId() != null,
    queryFn: async () => {
      const res = await apiFetch<PriceListItemRow[]>(`/api/v1/inventory/price-lists/${selectedId()}/items`);
      if (!res.success) throw new Error(res.message ?? "Failed to load items");
      return res.data ?? [];
    },
  }));

  const filteredLists = () => {
    const rows = list.data ?? [];
    const f = listTypeFilter();
    if (f === "selling") return rows.filter((pl) => pl.is_selling && !pl.is_buying);
    if (f === "buying") return rows.filter((pl) => pl.is_buying);
    return rows;
  };

  const createList = async () => {
    const name = newName().trim();
    if (!name) return;
    const isBuying = newListType() === "buying";
    const res = await apiFetch<PriceListRow>("/api/v1/inventory/price-lists", {
      method: "POST",
      body: JSON.stringify({ name, is_selling: !isBuying, is_buying: isBuying }),
    });
    if (!res.success) {
      toast.warning(res.message ?? "Failed to create price list.");
      return;
    }
    setNewName("");
    void client.invalidateQueries({ queryKey: ["price-lists"] });
    if (res.data) setSelectedId(res.data.id);
  };

  const addItem = async () => {
    const plId = selectedId();
    const iid = itemId();
    const rate = Number(itemRate());
    if (!plId || !iid || !rate) {
      toast.warning("Select an item and enter a rate.");
      return;
    }
    const res = await apiFetch(`/api/v1/inventory/price-lists/${plId}/items`, {
      method: "PUT",
      body: JSON.stringify({ items: [{ item_id: iid, rate }] }),
    });
    if (!res.success) {
      toast.warning(res.message ?? "Failed to save rate.");
      return;
    }
    setItemId(null);
    setItemLabel("");
    setItemRate("");
    void client.invalidateQueries({ queryKey: ["price-list-items", plId] });
  };

  return (
    <div class="space-y-4">
      <h1 class="text-xl font-semibold text-slate-900">Price List</h1>
      <p class="text-sm text-slate-600">
        Assign a default price list on the partner record; item pickers resolve rates from the list.
      </p>

      <div class="flex flex-wrap items-center gap-2">
        <input
          class="rounded border border-stroke px-3 py-2 text-sm"
          placeholder="New price list name"
          value={newName()}
          onInput={(e) => setNewName(e.currentTarget.value)}
        />
        <select
          class="rounded border border-stroke px-3 py-2 text-sm"
          value={newListType()}
          onChange={(e) => setNewListType(e.currentTarget.value as "selling" | "buying")}
        >
          <option value="selling">Selling</option>
          <option value="buying">Buying</option>
        </select>
        <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white" onClick={() => void createList()}>
          Add list
        </button>
      </div>

      <div class="flex gap-2">
        <button
          type="button"
          class="rounded border px-3 py-1 text-sm"
          classList={{ "border-brand-600 bg-brand-50 text-brand-700": listTypeFilter() === "all" }}
          onClick={() => setListTypeFilter("all")}
        >
          All
        </button>
        <button
          type="button"
          class="rounded border px-3 py-1 text-sm"
          classList={{ "border-brand-600 bg-brand-50 text-brand-700": listTypeFilter() === "selling" }}
          onClick={() => setListTypeFilter("selling")}
        >
          Selling
        </button>
        <button
          type="button"
          class="rounded border px-3 py-1 text-sm"
          classList={{ "border-brand-600 bg-brand-50 text-brand-700": listTypeFilter() === "buying" }}
          onClick={() => setListTypeFilter("buying")}
        >
          Buying
        </button>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <ul class="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          <For each={filteredLists()}>
            {(pl) => (
              <li>
                <button
                  type="button"
                  class={`flex w-full justify-between px-4 py-3 text-left text-sm hover:bg-slate-50 ${selectedId() === pl.id ? "bg-slate-50 font-medium" : ""}`}
                  onClick={() => setSelectedId(pl.id)}
                >
                  <span>{pl.name}</span>
                  <span class="text-slate-500">{pl.is_buying ? "Buying" : pl.is_selling ? "Selling" : "—"}</span>
                </button>
              </li>
            )}
          </For>
        </ul>

        <Show when={selectedId()}>
          <div class="rounded-lg border border-slate-200 bg-white p-4">
            <div class="mb-3 flex items-center justify-between">
              <h2 class="text-sm font-semibold">Item rates</h2>
              <RecordHistoryButton
                variant="button"
                targetType="inv_price_list"
                targetId={selectedId()}
                title={`History — ${filteredLists().find((pl) => pl.id === selectedId())?.name ?? "Price list"}`}
              />
            </div>
            <div class="mb-3 flex flex-wrap items-end gap-2">
              <div class="min-w-[220px] flex-1">
                <LookupCombo
                  label="Item"
                  value={itemLabel}
                  selectedId={itemId}
                  onInput={setItemLabel}
                  onSelect={(o) => {
                    setItemId(o.id);
                    setItemLabel(o.label);
                  }}
                  onClear={() => {
                    setItemId(null);
                    setItemLabel("");
                  }}
                  fetchOptions={fetchItems}
                  placeholder="Search item…"
                />
              </div>
              <input
                class="w-28 rounded border border-stroke px-2 py-1 text-sm"
                placeholder="Rate"
                value={itemRate()}
                onInput={(e) => setItemRate(e.currentTarget.value)}
              />
              <button type="button" class="rounded border border-stroke px-3 py-1 text-sm" onClick={() => void addItem()}>
                Add / update
              </button>
            </div>
            <table class="w-full text-sm">
              <thead class="text-left text-xs uppercase text-slate-500">
                <tr>
                  <th class="py-1">Item</th>
                  <th class="py-1 text-right">Rate</th>
                </tr>
              </thead>
              <tbody>
                <For each={items.data ?? []}>
                  {(row) => (
                    <tr class="border-t border-slate-100">
                      <td class="py-1">
                        {row.item_code} — {row.item_name}
                      </td>
                      <td class="py-1 text-right">{row.rate.toFixed(2)}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </div>
    </div>
  );
}
