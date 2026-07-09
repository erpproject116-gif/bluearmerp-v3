import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { LookupCombo, type LookupOption } from "../../shared/LookupCombo";
import { modalDismissClass } from "../../shared/Modal";
import { useToast } from "../../shared/toast";
import { LoadingText } from "../../shared/LoadingText";

type StockEntryRow = {
  id: number;
  entry_no: string;
  entry_date: string;
  entry_type: string;
  from_location_name: string;
  to_location_name: string;
  status: string;
};

async function fetchLocations(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; location_name: string }[]>(`/api/v1/inventory/locations?${qs}`);
  return (res.data ?? []).map((l) => ({ id: l.id, label: l.location_name }));
}

async function fetchItems(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; item_code: string; item_name: string }[]>(
    `/api/v1/inventory/items?${qs}`,
  );
  return (res.data ?? []).map((i) => ({ id: i.id, label: `${i.item_code} — ${i.item_name}` }));
}

export default function StockEntriesPage() {
  const toast = useToast();
  const client = useQueryClient();
  const [createOpen, setCreateOpen] = createSignal(false);
  const [entryType, setEntryType] = createSignal<"transfer" | "issue" | "receipt">("receipt");
  const [fromLocId, setFromLocId] = createSignal<number | null>(null);
  const [fromLocLabel, setFromLocLabel] = createSignal("");
  const [toLocId, setToLocId] = createSignal<number | null>(null);
  const [toLocLabel, setToLocLabel] = createSignal("");
  const [itemId, setItemId] = createSignal<number | null>(null);
  const [itemLabel, setItemLabel] = createSignal("");
  const [qty, setQty] = createSignal("1");
  const [creating, setCreating] = createSignal(false);
  const [postingId, setPostingId] = createSignal<number | null>(null);

  const list = createQuery(() => ({
    queryKey: ["stock-entries"],
    queryFn: async () => {
      const res = await apiFetch<StockEntryRow[]>("/api/v1/inventory/stock-entries");
      if (!res.success) throw new Error(res.message ?? "Failed to load");
      return res.data ?? [];
    },
  }));

  const invalidate = () => void client.invalidateQueries({ queryKey: ["stock-entries"] });

  const resetCreate = () => {
    setEntryType("receipt");
    setFromLocId(null);
    setFromLocLabel("");
    setToLocId(null);
    setToLocLabel("");
    setItemId(null);
    setItemLabel("");
    setQty("1");
  };

  const createEntry = async () => {
    const iid = itemId();
    const q = Number(qty());
    if (!iid || q <= 0) {
      toast.warning("Select item and quantity.");
      return;
    }
    const type = entryType();
    if ((type === "issue" || type === "transfer") && !fromLocId()) {
      toast.warning("Select source location.");
      return;
    }
    if ((type === "receipt" || type === "transfer") && !toLocId()) {
      toast.warning("Select destination location.");
      return;
    }
    setCreating(true);
    const res = await apiFetch<{ entry_no: string }>("/api/v1/inventory/stock-entries", {
      method: "POST",
      body: JSON.stringify({
        entry_type: type,
        from_location_id: fromLocId() ?? undefined,
        to_location_id: toLocId() ?? undefined,
        lines: [{ item_id: iid, qty: q }],
      }),
    });
    setCreating(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to create entry.");
      return;
    }
    toast.success(`Entry ${res.data?.entry_no ?? "created"}.`);
    resetCreate();
    setCreateOpen(false);
    invalidate();
  };

  const postEntry = async (row: StockEntryRow) => {
    if (row.status !== "draft") return;
    setPostingId(row.id);
    const res = await apiFetch(`/api/v1/inventory/stock-entries/${row.id}/post`, { method: "POST" });
    setPostingId(null);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to post.");
      return;
    }
    toast.success("Stock entry posted.");
    invalidate();
  };

  return (
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-semibold text-slate-900">Stock Entries</h1>
          <p class="mt-1 text-sm text-slate-600">Transfer, issue, or receipt stock between locations.</p>
        </div>
        <button
          type="button"
          class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          onClick={() => setCreateOpen(true)}
        >
          New entry
        </button>
      </div>

      <Show when={!list.isLoading} fallback={<LoadingText class="text-sm text-slate-500" as="p" />}>
        <table class="min-w-full overflow-hidden rounded-lg border border-slate-200 text-sm">
          <thead class="bg-slate-50">
            <tr>
              <th class="px-3 py-2 text-left">Entry No</th>
              <th class="px-3 py-2 text-left">Date</th>
              <th class="px-3 py-2 text-left">Type</th>
              <th class="px-3 py-2 text-left">From</th>
              <th class="px-3 py-2 text-left">To</th>
              <th class="px-3 py-2 text-left">Status</th>
              <th class="px-3 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            <For each={list.data ?? []}>
              {(row) => (
                <tr class="border-t border-slate-100">
                  <td class="px-3 py-2">{row.entry_no}</td>
                  <td class="px-3 py-2">{row.entry_date}</td>
                  <td class="px-3 py-2 capitalize">{row.entry_type}</td>
                  <td class="px-3 py-2">{row.from_location_name || "—"}</td>
                  <td class="px-3 py-2">{row.to_location_name || "—"}</td>
                  <td class="px-3 py-2 capitalize">{row.status}</td>
                  <td class="px-3 py-2">
                    <Show when={row.status === "draft"}>
                      <button
                        type="button"
                        class="text-brand-600 hover:underline disabled:opacity-50"
                        disabled={postingId() === row.id}
                        onClick={() => void postEntry(row)}
                      >
                        {postingId() === row.id ? "Posting…" : "Post"}
                      </button>
                    </Show>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Show>

      <Show when={createOpen()}>
        <div class="fixed inset-0 z-[55] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
          <div class="w-full max-w-lg rounded-2xl border border-stroke bg-white p-6 shadow-xl">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="text-lg font-semibold">New Stock Entry</h2>
              <button type="button" class={modalDismissClass} onClick={() => { resetCreate(); setCreateOpen(false); }}>
                Close
              </button>
            </div>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Type</span>
              <select
                class="mt-1 w-full rounded border border-stroke px-2 py-1.5"
                value={entryType()}
                onChange={(e) => setEntryType(e.currentTarget.value as "transfer" | "issue" | "receipt")}
              >
                <option value="receipt">Receipt</option>
                <option value="issue">Issue</option>
                <option value="transfer">Transfer</option>
              </select>
            </label>
            <Show when={entryType() === "issue" || entryType() === "transfer"}>
              <LookupCombo
                label="From location"
                required
                value={fromLocLabel}
                selectedId={fromLocId}
                onInput={setFromLocLabel}
                onSelect={(o) => { setFromLocId(o.id); setFromLocLabel(o.label); }}
                onClear={() => { setFromLocId(null); setFromLocLabel(""); }}
                fetchOptions={fetchLocations}
              />
            </Show>
            <Show when={entryType() === "receipt" || entryType() === "transfer"}>
              <div class="mt-3">
                <LookupCombo
                  label="To location"
                  required
                  value={toLocLabel}
                  selectedId={toLocId}
                  onInput={setToLocLabel}
                  onSelect={(o) => { setToLocId(o.id); setToLocLabel(o.label); }}
                  onClear={() => { setToLocId(null); setToLocLabel(""); }}
                  fetchOptions={fetchLocations}
                />
              </div>
            </Show>
            <div class="mt-3">
              <LookupCombo
                label="Item"
                required
                value={itemLabel}
                selectedId={itemId}
                onInput={setItemLabel}
                onSelect={(o) => { setItemId(o.id); setItemLabel(o.label); }}
                onClear={() => { setItemId(null); setItemLabel(""); }}
                fetchOptions={fetchItems}
              />
            </div>
            <label class="mt-3 block text-sm">
              <span class="text-text-secondary">Quantity</span>
              <input
                type="number"
                class="mt-1 w-full rounded border border-stroke px-2 py-1"
                min="0"
                value={qty()}
                onInput={(e) => setQty(e.currentTarget.value)}
              />
            </label>
            <div class="mt-6 flex justify-end gap-2">
              <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={() => { resetCreate(); setCreateOpen(false); }}>
                Cancel
              </button>
              <button
                type="button"
                class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={creating()}
                onClick={() => void createEntry()}
              >
                {creating() ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
