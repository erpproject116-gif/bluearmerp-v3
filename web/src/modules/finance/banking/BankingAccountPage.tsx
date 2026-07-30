import { A, useParams, useSearchParams } from "@solidjs/router";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { handleSaveResult } from "../../../shared/handleSaveResult";
import { formatPeso } from "../../../shared/money";
import { modalDismissClass } from "../../../shared/Modal";
import { useToast } from "../../../shared/toast";
import { uiLabel } from "../../../shared/branding/uiLabel";

type BankAccount = {
  id: number;
  bank_account_code: string;
  bank_account_name: string;
  account_type: string;
  institution_name: string;
  account_number: string;
  gl_account_code: string;
  gl_account_name?: string;
  opening_balance: number;
  opening_balance_date?: string | null;
  is_active: boolean;
};

type RegisterRow = {
  txn_date: string;
  txn_type: string;
  document_no: string;
  description: string;
  money_in: number;
  money_out: number;
  balance: number;
  ref_type?: string;
  ref_id?: number | null;
};

type RegisterPayload = {
  account: BankAccount;
  rows: RegisterRow[];
  closing_balance: number;
  transaction_count: number;
};

function typeLabel(t: string) {
  if (t === "credit_card") return "Credit card";
  if (t === "e_wallet") return "E-wallet";
  if (t === "opening_balance") return "Opening";
  if (t === "deposit") return "Deposit";
  if (t === "withdrawal") return "Withdrawal";
  if (t === "transfer_in") return "Transfer in";
  if (t === "transfer_out") return "Transfer out";
  return t;
}

export default function BankingAccountPage() {
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const client = useQueryClient();
  const accountId = () => Number(params.id);
  const [dateFrom, setDateFrom] = createSignal(String(searchParams.date_from ?? ""));
  const [dateTo, setDateTo] = createSignal(String(searchParams.date_to ?? ""));
  const [transferOpen, setTransferOpen] = createSignal(searchParams.transfer === "1");
  const [toAccountId, setToAccountId] = createSignal("");
  const [amount, setAmount] = createSignal("");
  const [transferDate, setTransferDate] = createSignal(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = createSignal("");
  const [notes, setNotes] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  const register = createQuery(() => ({
    queryKey: ["banking-register", accountId(), dateFrom(), dateTo()],
    enabled: Number.isFinite(accountId()) && accountId() > 0,
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (dateFrom()) qs.set("date_from", dateFrom());
      if (dateTo()) qs.set("date_to", dateTo());
      const res = await apiFetch<RegisterPayload>(`/api/v1/finance/bank-accounts/${accountId()}/register?${qs}`);
      if (!res.success || !res.data) throw new Error(res.message ?? "Failed to load register");
      return res.data;
    },
  }));

  const accounts = createQuery(() => ({
    queryKey: ["banking-accounts-options"],
    queryFn: async () => {
      const res = await apiFetch<BankAccount[]>(
        "/api/v1/finance/bank-accounts?page=1&pageSize=200&sort=bank_account_name&order=asc",
      );
      if (!res.success) throw new Error(res.message ?? "Failed to load accounts");
      return res.data ?? [];
    },
  }));

  const applyDates = () => {
    setSearchParams({
      date_from: dateFrom() || undefined,
      date_to: dateTo() || undefined,
    });
  };

  const saveTransfer = async () => {
    const toId = Number(toAccountId());
    const amt = Number(amount());
    if (!toId) {
      toast.warning("Select a destination account.");
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.warning("Enter a valid amount.");
      return;
    }
    setSaving(true);
    const res = await apiFetch("/api/v1/finance/bank-transfers", {
      method: "POST",
      body: JSON.stringify({
        transfer_date: transferDate(),
        from_bank_account_id: accountId(),
        to_bank_account_id: toId,
        amount: amt,
        reference_no: reference().trim(),
        notes: notes().trim(),
      }),
    });
    setSaving(false);
    if (!handleSaveResult(res, toast, "Transfer recorded.")) return;
    setTransferOpen(false);
    setAmount("");
    setReference("");
    setNotes("");
    void client.invalidateQueries({ queryKey: ["banking-register"] });
  };

  const acct = () => register.data?.account;

  return (
    <div class="space-y-4 p-4 md:p-6">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <A href="/app/finance/banking" class="text-sm text-brand-600 hover:underline">
            ← Banking
          </A>
          <Show when={acct()} fallback={<h1 class="mt-1 text-xl font-semibold">Account register</h1>}>
            {(a) => (
              <>
                <h1 class="mt-1 text-xl font-semibold text-text-primary">{a().bank_account_name}</h1>
                <p class="text-sm text-text-secondary">
                  {a().bank_account_code}
                  <Show when={a().institution_name}> · {a().institution_name}</Show>
                  {" · "}
                  {typeLabel(a().account_type)}
                </p>
              </>
            )}
          </Show>
        </div>
        <div class="flex flex-wrap gap-2">
          <A
            href={`/app/finance/acct-i/bank-reconciliation?bank_account_id=${accountId()}`}
            class="rounded-lg border border-stroke px-3 py-2 text-sm hover:bg-slate-50"
          >
            Reconcile
          </A>
          <button
            type="button"
            class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            onClick={() => setTransferOpen(true)}
          >
            Transfer
          </button>
        </div>
      </div>

      <Show when={acct()}>
        {(a) => (
          <div class="grid gap-3 sm:grid-cols-3">
            <div class="rounded-xl border border-stroke bg-white p-4">
              <p class="text-xs uppercase text-text-secondary">Opening balance</p>
              <p class="mt-1 text-lg font-semibold">{formatPeso(a().opening_balance)}</p>
              <p class="text-xs text-text-secondary">{a().opening_balance_date || "—"}</p>
            </div>
            <div class="rounded-xl border border-stroke bg-white p-4">
              <p class="text-xs uppercase text-text-secondary">Closing balance</p>
              <p class="mt-1 text-lg font-semibold">{formatPeso(register.data?.closing_balance ?? 0)}</p>
              <p class="text-xs text-text-secondary">{register.data?.transaction_count ?? 0} transactions</p>
            </div>
            <div class="rounded-xl border border-stroke bg-white p-4">
              <p class="text-xs uppercase text-text-secondary">GL account</p>
              <p class="mt-1 text-sm font-medium">{a().gl_account_code}</p>
              <p class="text-xs text-text-secondary">{a().gl_account_name || ""}</p>
            </div>
          </div>
        )}
      </Show>

      <div class="flex flex-wrap items-end gap-2">
        <label class="text-sm">
          <span class="mb-1 block text-xs text-text-secondary">From</span>
          <input type="date" class="rounded-lg border border-stroke px-3 py-2" value={dateFrom()} onInput={(e) => setDateFrom(e.currentTarget.value)} />
        </label>
        <label class="text-sm">
          <span class="mb-1 block text-xs text-text-secondary">To</span>
          <input type="date" class="rounded-lg border border-stroke px-3 py-2" value={dateTo()} onInput={(e) => setDateTo(e.currentTarget.value)} />
        </label>
        <button type="button" class="rounded-lg border border-stroke px-3 py-2 text-sm hover:bg-slate-50" onClick={applyDates}>
          Apply
        </button>
      </div>

      <Show when={!register.isLoading} fallback={<p class="text-sm text-text-secondary">{uiLabel("common.loading")}</p>}>
        <Show when={register.isError}>
          <p class="text-sm text-red-600">{(register.error as Error)?.message ?? "Failed to load."}</p>
        </Show>
        <div class="overflow-auto rounded-xl border border-stroke bg-white">
          <table class="min-w-full text-sm">
            <thead class="bg-slate-50 text-left text-xs uppercase text-text-secondary">
              <tr>
                <th class="px-3 py-2">Date</th>
                <th class="px-3 py-2">Type</th>
                <th class="px-3 py-2">Document</th>
                <th class="px-3 py-2">Description</th>
                <th class="px-3 py-2 text-right">Money in</th>
                <th class="px-3 py-2 text-right">Money out</th>
                <th class="px-3 py-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              <For
                each={register.data?.rows ?? []}
                fallback={
                  <tr>
                    <td class="px-3 py-8 text-center text-text-secondary" colSpan={7}>
                      No transactions yet for this account.
                    </td>
                  </tr>
                }
              >
                {(row) => (
                  <tr class="border-t border-stroke/60">
                    <td class="px-3 py-2 whitespace-nowrap">{row.txn_date}</td>
                    <td class="px-3 py-2">{typeLabel(row.txn_type)}</td>
                    <td class="px-3 py-2 font-medium">{row.document_no}</td>
                    <td class="px-3 py-2">{row.description}</td>
                    <td class="px-3 py-2 text-right text-emerald-700">
                      {row.money_in ? formatPeso(row.money_in) : "—"}
                    </td>
                    <td class="px-3 py-2 text-right text-red-700">
                      {row.money_out ? formatPeso(row.money_out) : "—"}
                    </td>
                    <td class="px-3 py-2 text-right font-medium">{formatPeso(row.balance)}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>

      <Show when={transferOpen()}>
        <div class="fixed inset-0 z-[55] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
          <div class="w-full max-w-md rounded-2xl border border-stroke bg-white p-6 shadow-xl">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="text-lg font-semibold">Transfer from this account</h2>
              <button type="button" class={modalDismissClass} onClick={() => setTransferOpen(false)}>
                Close
              </button>
            </div>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">To account</span>
              <select
                class="mt-1 w-full rounded border border-stroke px-2 py-1.5"
                value={toAccountId()}
                onChange={(e) => setToAccountId(e.currentTarget.value)}
              >
                <option value="">Select…</option>
                <For each={(accounts.data ?? []).filter((a) => a.id !== accountId() && a.is_active)}>
                  {(a) => (
                    <option value={String(a.id)}>
                      {a.bank_account_name} ({a.bank_account_code})
                    </option>
                  )}
                </For>
              </select>
            </label>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Date</span>
              <input
                type="date"
                class="mt-1 w-full rounded border border-stroke px-2 py-1.5"
                value={transferDate()}
                onInput={(e) => setTransferDate(e.currentTarget.value)}
              />
            </label>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Amount</span>
              <input
                type="number"
                min="0"
                step="0.01"
                class="mt-1 w-full rounded border border-stroke px-2 py-1.5"
                value={amount()}
                onInput={(e) => setAmount(e.currentTarget.value)}
              />
            </label>
            <label class="mb-3 block text-sm">
              <span class="text-text-secondary">Reference</span>
              <input
                class="mt-1 w-full rounded border border-stroke px-2 py-1.5"
                value={reference()}
                onInput={(e) => setReference(e.currentTarget.value)}
              />
            </label>
            <label class="mb-4 block text-sm">
              <span class="text-text-secondary">Notes</span>
              <input
                class="mt-1 w-full rounded border border-stroke px-2 py-1.5"
                value={notes()}
                onInput={(e) => setNotes(e.currentTarget.value)}
              />
            </label>
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              disabled={saving()}
              onClick={() => void saveTransfer()}
            >
              {saving() ? "Saving…" : "Record transfer"}
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}
