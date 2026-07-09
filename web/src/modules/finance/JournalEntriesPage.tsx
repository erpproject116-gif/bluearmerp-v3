import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { EntityModal, Field, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { LoadingText } from "../../shared/LoadingText";

type JournalEntryRow = { id: number; entry_no: string; status: string; remarks?: string };

type JournalLine = { account_code: string; debit: string; credit: string };
type AccountOption = { id: number; account_code: string; account_name: string; is_active: boolean };

export default function JournalEntriesPage() {
  const toast = useToast();
  const client = useQueryClient();
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [remarks, setRemarks] = createSignal("");
  const [lines, setLines] = createSignal<JournalLine[]>([
    { account_code: "", debit: "", credit: "" },
    { account_code: "", debit: "", credit: "" },
  ]);
  const [saving, setSaving] = createSignal(false);
  const [posting, setPosting] = createSignal(false);

  const list = createQuery(() => ({
    queryKey: ["journal-entries"],
    queryFn: async () => {
      const res = await apiFetch<JournalEntryRow[]>("/api/v1/finance/journal-entries?pageSize=50");
      if (!res.success) throw new Error(res.message ?? "Failed to load");
      return res.data ?? [];
    },
  }));
  const accounts = createQuery(() => ({
    queryKey: ["finance-accounts-picker"],
    queryFn: async () => {
      const res = await apiFetch<AccountOption[]>("/api/v1/finance/accounts?page=1&pageSize=500&status=active&sort=account_code&order=asc");
      if (!res.success) throw new Error(res.message ?? "Failed to load accounts");
      return res.data ?? [];
    },
  }));

  const invalidate = () => void client.invalidateQueries({ queryKey: ["journal-entries"] });

  const openCreate = () => {
    setRemarks("");
    setLines([
      { account_code: "", debit: "", credit: "" },
      { account_code: "", debit: "", credit: "" },
    ]);
    setModalOpen(true);
  };

  const createEntry = async () => {
    const parsed = lines()
      .map((ln) => ({
        account_code: ln.account_code.trim(),
        debit: Number(ln.debit) || 0,
        credit: Number(ln.credit) || 0,
      }))
      .filter((ln) => ln.account_code);
    if (parsed.length < 2) {
      toast.warning("At least two lines with account codes are required.");
      return;
    }
    setSaving(true);
    const res = await apiFetch<JournalEntryRow>("/api/v1/finance/journal-entries", {
      method: "POST",
      body: JSON.stringify({ remarks: remarks(), lines: parsed }),
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to create journal entry.");
      return;
    }
    toast.success("Draft journal entry created.");
    setModalOpen(false);
    invalidate();
  };

  const postSelected = async () => {
    const id = selectedId();
    const row = (list.data ?? []).find((r) => r.id === id);
    if (!row) {
      toast.warning("Select a draft journal entry to post.");
      return;
    }
    if (row.status !== "draft") {
      toast.warning("Only draft entries can be posted.");
      return;
    }
    setPosting(true);
    const res = await apiFetch(`/api/v1/finance/journal-entries/${id}/post`, { method: "POST" });
    setPosting(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to post journal entry.");
      return;
    }
    toast.success("Journal entry posted.");
    invalidate();
  };

  return (
    <div class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="text-xl font-semibold text-slate-900">Journal Entry</h1>
        <div class="flex gap-2">
          <button
            type="button"
            class="rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50"
            onClick={() => invalidate()}
          >
            Refresh
          </button>
          <button
            type="button"
            class="rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
            disabled={posting()}
            onClick={() => void postSelected()}
          >
            {posting() ? "Posting…" : "Post selected"}
          </button>
          <button
            type="button"
            class="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
            onClick={openCreate}
          >
            New draft
          </button>
        </div>
      </div>

      <Show when={!list.isLoading} fallback={<LoadingText class="text-sm text-slate-500" as="p" />}>
        <table class="min-w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
          <thead class="bg-slate-50">
            <tr>
              <th class="px-3 py-2 text-left w-10" />
              <th class="px-3 py-2 text-left">Entry No</th>
              <th class="px-3 py-2 text-left">Status</th>
              <th class="px-3 py-2 text-left">Remarks</th>
            </tr>
          </thead>
          <tbody>
            <For each={list.data ?? []}>
              {(row) => (
                <tr
                  classList={{
                    "border-t border-slate-100": true,
                    "bg-brand-50": selectedId() === row.id,
                  }}
                  onClick={() => setSelectedId(row.id)}
                >
                  <td class="px-3 py-2">
                    <input type="radio" checked={selectedId() === row.id} readOnly />
                  </td>
                  <td class="px-3 py-2">{row.entry_no}</td>
                  <td class="px-3 py-2 capitalize">{row.status}</td>
                  <td class="px-3 py-2">{row.remarks ?? "—"}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Show>

      <EntityModal
        open={modalOpen()}
        title="New journal entry (draft)"
        onClose={() => setModalOpen(false)}
        onSave={() => void createEntry()}
        saving={saving()}
        wide
      >
        <Field label="Remarks">
          <input class={inputClass} value={remarks()} onInput={(e) => setRemarks(e.currentTarget.value)} />
        </Field>
        <div class="col-span-2 space-y-2">
          <p class="text-sm font-medium text-text-primary">Lines</p>
          <For each={lines()}>
            {(ln, i) => (
              <div class="grid grid-cols-3 gap-2">
                <select
                  class={inputClass}
                  value={ln.account_code}
                  onChange={(e) =>
                    setLines((rows) => rows.map((r, idx) => (idx === i() ? { ...r, account_code: e.currentTarget.value } : r)))
                  }
                >
                  <option value="">Select account</option>
                  <For each={accounts.data ?? []}>
                    {(acc) => (
                      <option value={acc.account_code}>
                        {acc.account_code} - {acc.account_name}
                      </option>
                    )}
                  </For>
                </select>
                <input
                  class={inputClass}
                  type="number"
                  placeholder="Debit"
                  value={ln.debit}
                  onInput={(e) =>
                    setLines((rows) => rows.map((r, idx) => (idx === i() ? { ...r, debit: e.currentTarget.value } : r)))
                  }
                />
                <input
                  class={inputClass}
                  type="number"
                  placeholder="Credit"
                  value={ln.credit}
                  onInput={(e) =>
                    setLines((rows) => rows.map((r, idx) => (idx === i() ? { ...r, credit: e.currentTarget.value } : r)))
                  }
                />
              </div>
            )}
          </For>
          <button
            type="button"
            class="text-sm text-brand-600 hover:underline"
            onClick={() => setLines((rows) => [...rows, { account_code: "", debit: "", credit: "" }])}
          >
            + Add line
          </button>
        </div>
      </EntityModal>
    </div>
  );
}
