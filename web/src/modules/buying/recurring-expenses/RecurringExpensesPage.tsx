import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { formatPeso } from "../../../shared/money";
import { modalDismissClass } from "../../../shared/Modal";
import { useToast } from "../../../shared/toast";
import { uiLabel } from "../../../shared/branding/uiLabel";
import {
  PartnerSearchModal,
  type PartnerSearchRow,
} from "../../purchase-request/purchase-request/PartnerSearchModal";

type RecurringExpense = {
  id: number;
  name: string;
  category: string;
  vendor_name: string;
  amount: number;
  frequency: string;
  next_due_date?: string | null;
  is_active: boolean;
  notes: string;
  partner_id?: number | null;
};

export default function RecurringExpensesPage() {
  const toast = useToast();
  const client = useQueryClient();
  const [showInactive, setShowInactive] = createSignal(false);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editingId, setEditingId] = createSignal<number | null>(null);
  const [partnerPickerOpen, setPartnerPickerOpen] = createSignal(false);
  const [name, setName] = createSignal("");
  const [vendorName, setVendorName] = createSignal("");
  const [partnerId, setPartnerId] = createSignal<number | null>(null);
  const [category, setCategory] = createSignal("other");
  const [amount, setAmount] = createSignal("0");
  const [frequency, setFrequency] = createSignal("monthly");
  const [nextDue, setNextDue] = createSignal(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = createSignal("");
  const [isActive, setIsActive] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [busyId, setBusyId] = createSignal<number | null>(null);
  const [lastGenerated, setLastGenerated] = createSignal<{ expense_no: string; expense_id: number } | null>(null);

  const list = createQuery(() => ({
    queryKey: ["recurring-expenses", showInactive()],
    queryFn: async () => {
      const qs = showInactive() ? "active=0" : "active=1";
      const res = await apiFetch<RecurringExpense[]>(`/api/v1/finance/recurring-expenses?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load recurring expenses");
      return res.data ?? [];
    },
  }));

  const invalidate = () => void client.invalidateQueries({ queryKey: ["recurring-expenses"] });

  const pickPartner = (row: PartnerSearchRow) => {
    setPartnerId(row.id);
    setVendorName(row.company_name);
  };

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setVendorName("");
    setPartnerId(null);
    setCategory("other");
    setAmount("0");
    setFrequency("monthly");
    setNextDue(new Date().toISOString().slice(0, 10));
    setNotes("");
    setIsActive(true);
  };

  const openCreate = () => {
    resetForm();
    setModalOpen(true);
  };

  const openEdit = (row: RecurringExpense) => {
    setEditingId(row.id);
    setName(row.name);
    setVendorName(row.vendor_name);
    setPartnerId(row.partner_id ?? null);
    setCategory(row.category || "other");
    setAmount(String(row.amount));
    setFrequency(row.frequency);
    setNextDue(row.next_due_date ?? new Date().toISOString().slice(0, 10));
    setNotes(row.notes);
    setIsActive(row.is_active);
    setModalOpen(true);
  };

  const save = async () => {
    if (!name().trim()) {
      toast.warning("Name is required.");
      return;
    }
    const amt = Number(amount());
    if (!Number.isFinite(amt) || amt < 0) {
      toast.warning("Enter a valid amount.");
      return;
    }
    setSaving(true);
    const payload = {
      name: name().trim(),
      vendor_name: vendorName().trim(),
      partner_id: partnerId(),
      category: category().trim() || "other",
      amount: amt,
      frequency: frequency(),
      next_due_date: nextDue(),
      is_active: isActive(),
      notes: notes().trim(),
    };
    const id = editingId();
    const res = id
      ? await apiFetch(`/api/v1/finance/recurring-expenses/${id}`, { method: "PATCH", body: JSON.stringify(payload) })
      : await apiFetch("/api/v1/finance/recurring-expenses", { method: "POST", body: JSON.stringify(payload) });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to save schedule.");
      return;
    }
    toast.success(id ? "Schedule updated." : "Recurring expense schedule created.");
    setModalOpen(false);
    resetForm();
    invalidate();
  };

  const generate = async (row: RecurringExpense) => {
    if (!confirm(`Generate expense for “${row.name}” (${formatPeso(row.amount)})?`)) return;
    setBusyId(row.id);
    const res = await apiFetch<{ expense_id: number; expense_no: string; next_due_date: string }>(
      `/api/v1/finance/recurring-expenses/${row.id}/generate`,
      { method: "POST" },
    );
    setBusyId(null);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? "Could not generate expense.");
      return;
    }
    setLastGenerated({ expense_id: res.data.expense_id, expense_no: res.data.expense_no });
    toast.success(`Created ${res.data.expense_no}. Next due: ${res.data.next_due_date}.`);
    invalidate();
  };

  const remove = async (row: RecurringExpense) => {
    if (!confirm(`Delete recurring schedule “${row.name}”?`)) return;
    const res = await apiFetch(`/api/v1/finance/recurring-expenses/${row.id}`, { method: "DELETE" });
    if (!res.success) {
      toast.warning(res.message ?? "Could not delete.");
      return;
    }
    toast.success("Deleted.");
    invalidate();
  };

  return (
    <div class="space-y-4 p-4 md:p-6">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold text-text-primary">Recurring Expenses</h1>
          <p class="mt-1 text-sm text-text-secondary">
            Subscription-style expense schedules (rent, SaaS, utilities). Generate an expense when due.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <label class="flex items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" checked={showInactive()} onChange={(e) => setShowInactive(e.currentTarget.checked)} />
            Show inactive
          </label>
          <button
            type="button"
            class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            onClick={openCreate}
          >
            New schedule
          </button>
        </div>
      </div>

      <Show when={lastGenerated()}>
        <div class="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
          Last generated: {lastGenerated()!.expense_no}
          <button type="button" class="ml-3 text-xs underline opacity-80" onClick={() => setLastGenerated(null)}>
            Dismiss
          </button>
        </div>
      </Show>

      <Show when={!list.isLoading} fallback={<p class="text-sm text-text-secondary">{uiLabel("common.loading")}</p>}>
        <Show when={list.isError}>
          <p class="text-sm text-red-600">{(list.error as Error)?.message ?? "Failed to load."}</p>
        </Show>
        <table class="min-w-full overflow-hidden rounded-lg border border-stroke text-sm">
          <thead class="bg-slate-50">
            <tr>
              <th class="px-3 py-2 text-left">Name</th>
              <th class="px-3 py-2 text-left">Vendor</th>
              <th class="px-3 py-2 text-right">Amount</th>
              <th class="px-3 py-2 text-left">Frequency</th>
              <th class="px-3 py-2 text-left">Next due</th>
              <th class="px-3 py-2 text-left">Active</th>
              <th class="px-3 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            <For each={list.data ?? []} fallback={<tr><td class="px-3 py-6 text-center text-text-secondary" colSpan={7}>No recurring expenses yet.</td></tr>}>
              {(row) => (
                <tr class="border-t border-stroke/60">
                  <td class="px-3 py-2 font-medium">{row.name}</td>
                  <td class="px-3 py-2">{row.vendor_name || "—"}</td>
                  <td class="px-3 py-2 text-right">{formatPeso(row.amount)}</td>
                  <td class="px-3 py-2 capitalize">{row.frequency}</td>
                  <td class="px-3 py-2">{row.next_due_date ?? "—"}</td>
                  <td class="px-3 py-2">{row.is_active ? "Yes" : "No"}</td>
                  <td class="px-3 py-2">
                    <div class="flex flex-wrap gap-2">
                      <button type="button" class="text-text-secondary hover:underline" onClick={() => openEdit(row)}>
                        Edit
                      </button>
                      <Show when={row.is_active}>
                        <button
                          type="button"
                          class="text-brand-600 hover:underline disabled:opacity-50"
                          disabled={busyId() === row.id}
                          onClick={() => void generate(row)}
                        >
                          {busyId() === row.id ? "…" : "Generate"}
                        </button>
                      </Show>
                      <button type="button" class="text-red-600 hover:underline" onClick={() => void remove(row)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Show>

      <Show when={modalOpen()}>
        <div class="fixed inset-0 z-[55] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
          <div class="w-full max-w-lg rounded-2xl border border-stroke bg-white p-6 shadow-xl">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="text-lg font-semibold">{editingId() ? "Edit schedule" : "New recurring expense"}</h2>
              <button type="button" class={modalDismissClass} onClick={() => setModalOpen(false)}>Close</button>
            </div>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Schedule name</span>
              <input class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
            </label>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Vendor partner</span>
              <div class="mt-1 flex gap-2">
                <input
                  class="w-full rounded border border-stroke px-2 py-1.5"
                  readOnly
                  value={vendorName() || (partnerId() ? `Partner #${partnerId()}` : "")}
                  placeholder="Select vendor…"
                />
                <button type="button" class="shrink-0 rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50" onClick={() => setPartnerPickerOpen(true)}>
                  Find…
                </button>
              </div>
            </label>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Category</span>
              <select class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={category()} onChange={(e) => setCategory(e.currentTarget.value)}>
                <option value="other">Other</option>
                <option value="rent">Rent</option>
                <option value="utilities">Utilities</option>
                <option value="saas">SaaS / subscriptions</option>
                <option value="insurance">Insurance</option>
              </select>
            </label>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Amount</span>
              <input type="number" min="0" step="0.01" class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={amount()} onInput={(e) => setAmount(e.currentTarget.value)} />
            </label>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Frequency</span>
              <select class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={frequency()} onChange={(e) => setFrequency(e.currentTarget.value)}>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </label>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Next due date</span>
              <input type="date" class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={nextDue()} onInput={(e) => setNextDue(e.currentTarget.value)} />
            </label>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Notes</span>
              <input class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={notes()} onInput={(e) => setNotes(e.currentTarget.value)} />
            </label>
            <label class="mb-4 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isActive()} onChange={(e) => setIsActive(e.currentTarget.checked)} />
              Active
            </label>
            <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50" disabled={saving()} onClick={() => void save()}>
              {saving() ? "Saving…" : "Save schedule"}
            </button>
          </div>
        </div>
      </Show>

      <PartnerSearchModal open={partnerPickerOpen()} onClose={() => setPartnerPickerOpen(false)} onSelect={pickPartner} />
    </div>
  );
}
