import { createQuery } from "@tanstack/solid-query";
import { For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";

type JournalEntryRow = { id: number; entry_no: string; status: string; remarks?: string };

export default function JournalEntriesPage() {
  const list = createQuery(() => ({
    queryKey: ["journal-entries"],
    queryFn: async () => {
      const res = await apiFetch<JournalEntryRow[]>("/api/v1/finance/journal-entries?pageSize=50");
      if (!res.success) throw new Error(res.message ?? "Failed to load");
      return res.data ?? [];
    },
  }));

  return (
    <div class="space-y-4">
      <h1 class="text-xl font-semibold text-slate-900">Journal Entry</h1>
      <Show when={!list.isLoading} fallback={<p class="text-sm text-slate-500">Loading…</p>}>
        <table class="min-w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
          <thead class="bg-slate-50">
            <tr>
              <th class="px-3 py-2 text-left">Entry No</th>
              <th class="px-3 py-2 text-left">Status</th>
              <th class="px-3 py-2 text-left">Remarks</th>
            </tr>
          </thead>
          <tbody>
            <For each={list.data ?? []}>
              {(row) => (
                <tr class="border-t border-slate-100">
                  <td class="px-3 py-2">{row.entry_no}</td>
                  <td class="px-3 py-2">{row.status}</td>
                  <td class="px-3 py-2">{row.remarks ?? "—"}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Show>
    </div>
  );
}
