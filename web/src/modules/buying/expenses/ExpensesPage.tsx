import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { formatPeso } from "../../../shared/money";
import { modalDismissClass } from "../../../shared/Modal";
import { useToast } from "../../../shared/toast";
import { uiLabel } from "../../../shared/branding/uiLabel";

type Expense = {
  id: number;
  expense_date: string;
  expense_no: string;
  vendor_name: string;
  category: string;
  description: string;
  amount: number;
  tax_amount: number;
  payment_status: string;
  paid_at?: string | null;
  reference?: string | null;
};

export default function ExpensesPage() {
  const toast = useToast();
  const client = useQueryClient();
  const [status, setStatus] = createSignal("");
  const [createOpen, setCreateOpen] = createSignal(false);
  const [vendorName, setVendorName] = createSignal("");
  const [category, setCategory] = createSignal("general");
  const [description, setDescription] = createSignal("");
  const [amount, setAmount] = createSignal("0");
  const [taxAmount, setTaxAmount] = createSignal("0");
  const [expenseDate, setExpenseDate] = createSignal(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = createSignal(false);
  const [busyId, setBusyId] = createSignal<number | null>(null);

  const list = createQuery(() => ({
    queryKey: ["expenses", status()],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (status()) qs.set("payment_status", status());
      const res = await apiFetch<Expense[]>(`/api/v1/finance/expenses?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load expenses");
      return res.data ?? [];
    },
  }));

  const invalidate = () => void client.invalidateQueries({ queryKey: ["expenses"] });

  const resetForm = () => {
    setVendorName("");
    setCategory("general");
    setDescription("");
    setAmount("0");
    setTaxAmount("0");
    setExpenseDate(new Date().toISOString().slice(0, 10));
  };

  const create = async () => {
    const amt = Number(amount());
    if (!Number.isFinite(amt) || amt < 0) {
      toast.warning("Enter a valid amount.");
      return;
    }
    setSaving(true);
    const res = await apiFetch("/api/v1/finance/expenses", {
      method: "POST",
      body: JSON.stringify({
        expense_date: expenseDate(),
        vendor_name: vendorName().trim(),
        category: category().trim() || "general",
        description: description().trim(),
        amount: amt,
        tax_amount: Number(taxAmount()) || 0,
      }),
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to create expense.");
      return;
    }
    toast.success("Expense created.");
    resetForm();
    setCreateOpen(false);
    invalidate();
  };

  const markPaid = async (row: Expense) => {
    if (row.payment_status === "paid") return;
    if (!confirm(`Mark ${row.expense_no} as paid?`)) return;
    setBusyId(row.id);
    const res = await apiFetch(`/api/v1/finance/expenses/${row.id}/mark-paid`, { method: "POST" });
    setBusyId(null);
    if (!res.success) {
      toast.warning(res.message ?? "Could not mark paid.");
      return;
    }
    toast.success("Marked as paid.");
    invalidate();
  };

  return (
    <div class="space-y-4 p-4 md:p-6">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold text-text-primary">Expenses</h1>
          <p class="mt-1 text-sm text-text-secondary">
            Record purchasing expenses (meals, travel, supplies, and more). Mark paid when you confirm payment.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <select
            class="rounded border border-stroke px-2 py-1.5 text-sm"
            value={status()}
            onChange={(e) => setStatus(e.currentTarget.value)}
          >
            <option value="">All statuses</option>
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid</option>
          </select>
          <button
            type="button"
            class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            onClick={() => setCreateOpen(true)}
          >
            New expense
          </button>
        </div>
      </div>

      <Show when={!list.isLoading} fallback={<p class="text-sm text-text-secondary">{uiLabel("common.loading")}</p>}>
        <Show when={list.isError}>
          <p class="text-sm text-red-600">{(list.error as Error)?.message ?? "Failed to load."}</p>
        </Show>
        <table class="min-w-full overflow-hidden rounded-lg border border-stroke text-sm">
          <thead class="bg-slate-50">
            <tr>
              <th class="px-3 py-2 text-left">No</th>
              <th class="px-3 py-2 text-left">Date</th>
              <th class="px-3 py-2 text-left">Vendor</th>
              <th class="px-3 py-2 text-left">Category</th>
              <th class="px-3 py-2 text-left">Description</th>
              <th class="px-3 py-2 text-right">Amount</th>
              <th class="px-3 py-2 text-left">Status</th>
              <th class="px-3 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            <For each={list.data ?? []} fallback={<tr><td class="px-3 py-6 text-center text-text-secondary" colSpan={8}>No expenses yet.</td></tr>}>
              {(row) => (
                <tr class="border-t border-stroke/60">
                  <td class="px-3 py-2">{row.expense_no}</td>
                  <td class="px-3 py-2">{row.expense_date}</td>
                  <td class="px-3 py-2">{row.vendor_name || "—"}</td>
                  <td class="px-3 py-2 capitalize">{row.category}</td>
                  <td class="px-3 py-2">{row.description || "—"}</td>
                  <td class="px-3 py-2 text-right">{formatPeso(row.amount + row.tax_amount)}</td>
                  <td class="px-3 py-2 capitalize">{row.payment_status}</td>
                  <td class="px-3 py-2">
                    <Show when={row.payment_status === "unpaid"}>
                      <button
                        type="button"
                        class="text-brand-600 hover:underline disabled:opacity-50"
                        disabled={busyId() === row.id}
                        onClick={() => void markPaid(row)}
                      >
                        {busyId() === row.id ? "…" : "Mark paid"}
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
              <h2 class="text-lg font-semibold">New expense</h2>
              <button type="button" class={modalDismissClass} onClick={() => setCreateOpen(false)}>
                Close
              </button>
            </div>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Date</span>
              <input type="date" class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={expenseDate()} onInput={(e) => setExpenseDate(e.currentTarget.value)} />
            </label>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Vendor / payee</span>
              <input class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={vendorName()} onInput={(e) => setVendorName(e.currentTarget.value)} />
            </label>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Category</span>
              <select class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={category()} onChange={(e) => setCategory(e.currentTarget.value)}>
                <option value="general">General</option>
                <option value="travel">Travel</option>
                <option value="meals">Meals</option>
                <option value="supplies">Supplies</option>
                <option value="utilities">Utilities</option>
                <option value="rent">Rent</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Description</span>
              <input class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={description()} onInput={(e) => setDescription(e.currentTarget.value)} />
            </label>
            <div class="mb-3 grid grid-cols-2 gap-3">
              <label class="block text-sm">
                <span class="text-text-secondary">Amount</span>
                <input type="number" min="0" step="0.01" class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={amount()} onInput={(e) => setAmount(e.currentTarget.value)} />
              </label>
              <label class="block text-sm">
                <span class="text-text-secondary">Tax</span>
                <input type="number" min="0" step="0.01" class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={taxAmount()} onInput={(e) => setTaxAmount(e.currentTarget.value)} />
              </label>
            </div>
            <div class="mt-6 flex justify-end gap-2">
              <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={() => setCreateOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={saving()}
                onClick={() => void create()}
              >
                {saving() ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
