import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, Show } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { apiFetch } from "../../../shared/api";
import { handleSaveResult } from "../../../shared/handleSaveResult";
import { formatPeso } from "../../../shared/money";
import { modalDismissClass } from "../../../shared/Modal";
import { useToast } from "../../../shared/toast";
import { uiLabel } from "../../../shared/branding/uiLabel";
import { hasPermission, useAuth } from "../../../shared/auth-context";
import {
  PartnerSearchModal,
  type PartnerSearchRow,
} from "../../purchase-request/purchase-request/PartnerSearchModal";
import { RecordHistoryButton } from "../../../shared/RecordHistoryButton";

type Expense = {
  id: number;
  expense_date: string;
  expense_no: string;
  partner_id?: number | null;
  vendor_name: string;
  category: string;
  description: string;
  amount: number;
  tax_amount: number;
  payment_status: string;
  paid_at?: string | null;
  payment_voucher_id?: number | null;
  reference?: string | null;
};

type BankAccount = { id: number; bank_account_name: string; bank_account_code: string };

export default function ExpensesPage() {
  const toast = useToast();
  const auth = useAuth();
  const client = useQueryClient();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = createSignal("");
  const [formOpen, setFormOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<Expense | null>(null);
  const [payOpen, setPayOpen] = createSignal<Expense | null>(null);
  const [partnerPickerOpen, setPartnerPickerOpen] = createSignal(false);
  const [partnerId, setPartnerId] = createSignal<number | null>(null);
  const [vendorName, setVendorName] = createSignal("");
  const [category, setCategory] = createSignal("general");
  const [description, setDescription] = createSignal("");
  const [amount, setAmount] = createSignal("0");
  const [taxAmount, setTaxAmount] = createSignal("0");
  const [expenseDate, setExpenseDate] = createSignal(new Date().toISOString().slice(0, 10));
  const [payNow, setPayNow] = createSignal(false);
  const [paymentMethod, setPaymentMethod] = createSignal("cash");
  const [bankAccountId, setBankAccountId] = createSignal("");
  const [referenceNo, setReferenceNo] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [busyId, setBusyId] = createSignal<number | null>(null);

  const canWrite = () => hasPermission(auth.me, "finance.expenses_write", "write");
  const recurringFilter = () => {
    const raw = searchParams.recurring_expense_id;
    const v = Array.isArray(raw) ? raw[0] : raw;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const bankAccounts = createQuery(() => ({
    queryKey: ["bank-accounts-expenses"],
    queryFn: async () => {
      const res = await apiFetch<BankAccount[]>(
        "/api/v1/finance/bank-accounts?page=1&pageSize=200&sort=bank_account_name&order=asc",
      );
      if (!res.success) return [];
      return res.data ?? [];
    },
  }));

  const list = createQuery(() => ({
    queryKey: ["expenses", status(), recurringFilter()],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (status()) qs.set("payment_status", status());
      const rid = recurringFilter();
      if (rid) qs.set("recurring_expense_id", String(rid));
      const res = await apiFetch<Expense[]>(`/api/v1/finance/expenses?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load expenses");
      return res.data ?? [];
    },
  }));

  const invalidate = () => void client.invalidateQueries({ queryKey: ["expenses"] });

  const pickPartner = (row: PartnerSearchRow) => {
    setPartnerId(row.id);
    setVendorName(row.company_name);
  };

  const resetForm = () => {
    setEditing(null);
    setPartnerId(null);
    setVendorName("");
    setCategory("general");
    setDescription("");
    setAmount("0");
    setTaxAmount("0");
    setExpenseDate(new Date().toISOString().slice(0, 10));
    setPayNow(false);
    setPaymentMethod("cash");
    setBankAccountId("");
    setReferenceNo("");
  };

  const paymentPayload = () => {
    const body: Record<string, unknown> = { payment_method: paymentMethod() };
    const bankId = Number(bankAccountId());
    if (bankId > 0) body.bank_account_id = bankId;
    if (referenceNo().trim()) body.reference_no = referenceNo().trim();
    return body;
  };

  const openCreate = () => {
    resetForm();
    setFormOpen(true);
  };

  const openEdit = (row: Expense) => {
    setEditing(row);
    setPartnerId(row.partner_id ?? null);
    setVendorName(row.vendor_name);
    setCategory(row.category || "general");
    setDescription(row.description);
    setAmount(String(row.amount));
    setTaxAmount(String(row.tax_amount));
    setExpenseDate(row.expense_date);
    setPayNow(false);
    setPaymentMethod("cash");
    setBankAccountId("");
    setReferenceNo(row.reference ?? "");
    setFormOpen(true);
  };

  const saveExpense = async () => {
    const amt = Number(amount());
    if (!Number.isFinite(amt) || amt < 0) {
      toast.warning("Enter a valid amount.");
      return;
    }
    const ed = editing();
    if (!ed && payNow() && !partnerId()) {
      toast.warning("Select a vendor partner to pay immediately.");
      return;
    }
    if (!ed && payNow() && paymentMethod() !== "cash" && !bankAccountId()) {
      toast.warning("Select a bank account for check or bank transfer.");
      return;
    }
    setSaving(true);
    const payload = {
      expense_date: expenseDate(),
      partner_id: partnerId(),
      vendor_name: vendorName().trim(),
      category: category().trim() || "general",
      description: description().trim(),
      amount: amt,
      tax_amount: Number(taxAmount()) || 0,
      reference: referenceNo().trim() || undefined,
      pay_now: payNow(),
      payment_method: paymentMethod(),
      bank_account_id: bankAccountId() ? Number(bankAccountId()) : undefined,
    };
    const res = ed
      ? await apiFetch(`/api/v1/finance/expenses/${ed.id}`, { method: "PATCH", body: JSON.stringify(payload) })
      : await apiFetch("/api/v1/finance/expenses", { method: "POST", body: JSON.stringify(payload) });
    setSaving(false);
    if (!res.success) {
      handleSaveResult(res, toast);
      return;
    }
    toast.success(ed ? "Expense updated." : payNow() ? "Expense created and paid." : "Expense created.");
    resetForm();
    setFormOpen(false);
    invalidate();
  };

  const removeExpense = async (row: Expense) => {
    if (row.payment_status === "paid") return;
    if (!confirm(`Delete expense ${row.expense_no}?`)) return;
    setBusyId(row.id);
    const res = await apiFetch(`/api/v1/finance/expenses/${row.id}`, { method: "DELETE" });
    setBusyId(null);
    if (!handleSaveResult(res, toast, "Expense deleted.")) return;
    invalidate();
  };

  const markPaid = async (row: Expense) => {
    if (row.payment_status === "paid") return;
    if (!partnerId() && !row.partner_id) {
      toast.warning("Link a vendor partner on this expense before paying.");
      return;
    }
    if (paymentMethod() !== "cash" && !bankAccountId()) {
      toast.warning("Select a bank account for check or bank transfer.");
      return;
    }
    setBusyId(row.id);
    const res = await apiFetch(`/api/v1/finance/expenses/${row.id}/mark-paid`, {
      method: "POST",
      body: JSON.stringify(paymentPayload()),
    });
    setBusyId(null);
    if (!handleSaveResult(res, toast, "Expense paid. Payment voucher recorded.")) return;
    setPayOpen(null);
    invalidate();
  };

  const openPay = (row: Expense) => {
    setPartnerId(row.partner_id ?? null);
    setVendorName(row.vendor_name);
    setPaymentMethod("bank_transfer");
    setBankAccountId("");
    setReferenceNo(row.reference ?? "");
    setPayOpen(row);
  };

  return (
    <div class="space-y-4 p-4 md:p-6">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold text-text-primary">Expenses</h1>
          <p class="mt-1 text-sm text-text-secondary">
            Record purchasing expenses. Paying creates a payment voucher and bank outflow when a bank account is used.
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
            class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            disabled={!canWrite()}
            onClick={openCreate}
          >
            New expense
          </button>
        </div>
      </div>

      <Show when={recurringFilter()}>
        <p class="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800">
          Showing expenses generated from recurring schedule #{recurringFilter()}.
        </p>
      </Show>

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
                    <div class="flex flex-wrap items-center gap-2">
                      <Show when={row.payment_status === "unpaid"}>
                        <button
                          type="button"
                          class="text-brand-600 hover:underline disabled:opacity-50"
                          disabled={busyId() === row.id}
                          onClick={() => openPay(row)}
                        >
                          Mark paid
                        </button>
                        <Show when={canWrite()}>
                          <button
                            type="button"
                            class="text-text-secondary hover:underline disabled:opacity-50"
                            disabled={busyId() === row.id}
                            onClick={() => openEdit(row)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            class="text-red-600 hover:underline disabled:opacity-50"
                            disabled={busyId() === row.id}
                            onClick={() => void removeExpense(row)}
                          >
                            Delete
                          </button>
                        </Show>
                      </Show>
                      <Show when={row.payment_voucher_id}>
                        <span class="text-xs text-text-secondary">PV #{row.payment_voucher_id}</span>
                      </Show>
                      <RecordHistoryButton
                        targetType="fin_expense"
                        targetId={row.id}
                        title={`History — ${row.expense_no}`}
                      />
                    </div>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Show>

      <Show when={formOpen()}>
        <div class="fixed inset-0 z-[55] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
          <div class="w-full max-w-lg rounded-2xl border border-stroke bg-white p-6 shadow-xl">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="text-lg font-semibold">{editing() ? `Edit ${editing()!.expense_no}` : "New expense"}</h2>
              <button type="button" class={modalDismissClass} onClick={() => setFormOpen(false)}>Close</button>
            </div>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Date</span>
              <input type="date" class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={expenseDate()} onInput={(e) => setExpenseDate(e.currentTarget.value)} disabled={Boolean(editing())} />
            </label>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Vendor partner</span>
              <div class="mt-1 flex gap-2">
                <input class="w-full rounded border border-stroke px-2 py-1.5" readOnly value={vendorName() || (partnerId() ? `Partner #${partnerId()}` : "")} placeholder="Select vendor…" />
                <button type="button" class="shrink-0 rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50" onClick={() => setPartnerPickerOpen(true)}>Find…</button>
              </div>
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
            <Show when={!editing()}>
              <label class="mb-3 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={payNow()} onChange={(e) => setPayNow(e.currentTarget.checked)} />
                Pay immediately (creates payment voucher)
              </label>
            </Show>
            <Show when={!editing() && payNow()}>
              <label class="mb-3 block text-sm">
                <span class="text-text-secondary">Payment method</span>
                <select class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={paymentMethod()} onChange={(e) => setPaymentMethod(e.currentTarget.value)}>
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="check">Check</option>
                </select>
              </label>
              <Show when={paymentMethod() !== "cash"}>
                <label class="mb-3 block text-sm">
                  <span class="text-text-secondary">Bank account</span>
                  <select class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={bankAccountId()} onChange={(e) => setBankAccountId(e.currentTarget.value)}>
                    <option value="">Select account…</option>
                    <For each={bankAccounts.data ?? []}>
                      {(acct) => <option value={String(acct.id)}>{acct.bank_account_name} ({acct.bank_account_code})</option>}
                    </For>
                  </select>
                </label>
              </Show>
              <label class="mb-3 block text-sm">
                <span class="text-text-secondary">Reference / check no.</span>
                <input class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={referenceNo()} onInput={(e) => setReferenceNo(e.currentTarget.value)} />
              </label>
            </Show>
            <div class="mt-6 flex justify-end gap-2">
              <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={() => setFormOpen(false)}>Cancel</button>
              <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={saving() || !canWrite()} onClick={() => void saveExpense()}>
                {saving() ? "Saving…" : editing() ? "Save changes" : payNow() ? "Save & pay" : "Save"}
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={payOpen()}>
        {(row) => (
          <div class="fixed inset-0 z-[55] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
            <div class="w-full max-w-md rounded-2xl border border-stroke bg-white p-6 shadow-xl">
              <div class="mb-4 flex items-center justify-between">
                <h2 class="text-lg font-semibold">Pay {row().expense_no}</h2>
                <button type="button" class={modalDismissClass} onClick={() => setPayOpen(null)}>Close</button>
              </div>
              <p class="mb-4 text-sm text-text-secondary">
                {row().vendor_name || "Vendor"} · {formatPeso(row().amount + row().tax_amount)}
              </p>
              <Show when={!row().partner_id && !partnerId()}>
                <p class="mb-3 text-sm text-amber-700">Select a vendor partner before paying.</p>
                <button type="button" class="mb-3 rounded-lg border border-stroke px-3 py-1.5 text-sm" onClick={() => setPartnerPickerOpen(true)}>Find vendor…</button>
              </Show>
              <label class="mb-3 block text-sm">
                <span class="text-text-secondary">Payment method</span>
                <select class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={paymentMethod()} onChange={(e) => setPaymentMethod(e.currentTarget.value)}>
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="check">Check</option>
                </select>
              </label>
              <Show when={paymentMethod() !== "cash"}>
                <label class="mb-3 block text-sm">
                  <span class="text-text-secondary">Bank account</span>
                  <select class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={bankAccountId()} onChange={(e) => setBankAccountId(e.currentTarget.value)}>
                    <option value="">Select account…</option>
                    <For each={bankAccounts.data ?? []}>
                      {(acct) => <option value={String(acct.id)}>{acct.bank_account_name}</option>}
                    </For>
                  </select>
                </label>
              </Show>
              <label class="mb-4 block text-sm">
                <span class="text-text-secondary">Reference / check no.</span>
                <input class="mt-1 w-full rounded border border-stroke px-2 py-1.5" value={referenceNo()} onInput={(e) => setReferenceNo(e.currentTarget.value)} />
              </label>
              <button
                type="button"
                class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={busyId() === row().id}
                onClick={() => void markPaid(row())}
              >
                {busyId() === row().id ? "Processing…" : "Confirm payment"}
              </button>
            </div>
          </div>
        )}
      </Show>

      <PartnerSearchModal open={partnerPickerOpen()} onClose={() => setPartnerPickerOpen(false)} onSelect={pickPartner} />
    </div>
  );
}
