import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { ActivityHistoryLink } from "../../shared/ActivityHistoryLink";
import { useToast } from "../../shared/toast";
import { uiLabel } from "../../shared/branding/uiLabel";
import { StockEntryModal } from "./StockEntryModal";

type StockEntryRow = {
  id: number;
  entry_no: string;
  entry_date: string;
  entry_type: string;
  from_location_name: string;
  to_location_name: string;
  status: string;
};

export default function StockEntriesPage() {
  const toast = useToast();
  const client = useQueryClient();
  const [createOpen, setCreateOpen] = createSignal(false);
  const [postingId, setPostingId] = createSignal<number | null>(null);

  const list = createQuery(() => ({
    queryKey: ["stock-entries"],
    queryFn: async () => {
      const res = await apiFetch<StockEntryRow[]>("/api/v1/inventory/stock-entries");
      if (!res.success) throw new Error(res.message ?? "Failed to load");
      return res.data ?? [];
    },
  }));

  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ["stock-entries"] });
    void client.invalidateQueries({ queryKey: ["stock-movements"] });
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

      <Show when={!list.isLoading} fallback={<p class="text-sm text-slate-500">{uiLabel("common.loading")}</p>}>
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
              <th class="px-3 py-2 text-left">History</th>
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
                  <td class="px-3 py-2">
                    <ActivityHistoryLink module="inventory" targetType="inv_stock_entry" targetId={row.id} title={`History — ${row.entry_no}`} />
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Show>

      <StockEntryModal
        open={createOpen()}
        onClose={() => setCreateOpen(false)}
        onCreated={invalidate}
        autoPost={false}
      />
    </div>
  );
}
