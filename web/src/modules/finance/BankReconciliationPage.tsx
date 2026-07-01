import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { createMemo, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { FinanceLayout } from "./FinanceLayout";

type BankAccount = { id: number; bank_account_code: string; bank_account_name: string };
type UnmatchedPayment = {
  payment_type: "official_receipt" | "payment_voucher";
  payment_id: number;
  payment_date: string;
  document_no: string;
  partner_name: string;
  payment_method: string;
  reference_no?: string;
  amount: number;
};
type StatementLine = {
  id: number;
  bank_account_id: number;
  statement_date: string;
  reference_no?: string;
  description?: string;
  amount: number;
  is_matched: boolean;
};

export default function BankReconciliationPage() {
  const toast = useToast();
  const client = useQueryClient();
  const [bankAccountId, setBankAccountId] = createSignal("");
  const [selectedStatementLineId, setSelectedStatementLineId] = createSignal<number | null>(null);
  const [matching, setMatching] = createSignal<number | null>(null);

  const accounts = createQuery(() => ({
    queryKey: ["finance-bank-accounts-options"],
    queryFn: async () => {
      const res = await apiFetch<BankAccount[]>("/api/v1/finance/bank-accounts?page=1&pageSize=200&sort=bank_account_name&order=asc");
      if (!res.success) throw new Error(res.message ?? "Failed to load bank accounts");
      return res.data ?? [];
    },
  }));

  const statements = createQuery(() => {
    const qs = new URLSearchParams({ page: "1", pageSize: "100", unmatched_only: "true" });
    if (bankAccountId()) qs.set("bank_account_id", bankAccountId());
    return {
      queryKey: ["finance-bank-recon-statements", bankAccountId()],
      queryFn: async () => {
        const res = await apiFetch<StatementLine[]>(`/api/v1/finance/bank-reconciliation/statement-lines?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load statement lines");
        return res.data ?? [];
      },
    };
  });

  const unmatched = createQuery(() => {
    const qs = new URLSearchParams({ page: "1", pageSize: "100", sort: "payment_date", order: "desc" });
    if (bankAccountId()) qs.set("bank_account_id", bankAccountId());
    return {
      queryKey: ["finance-bank-recon-unmatched", bankAccountId()],
      queryFn: async () => {
        const res = await apiFetch<UnmatchedPayment[]>(`/api/v1/finance/bank-reconciliation/unmatched?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load unmatched payments");
        return res.data ?? [];
      },
    };
  });

  const selectedStatementLine = createMemo(() => (statements.data ?? []).find((s) => s.id === selectedStatementLineId()) ?? null);

  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["finance-bank-recon-statements"] });
    void client.invalidateQueries({ queryKey: ["finance-bank-recon-unmatched"] });
  };

  const match = async (row: UnmatchedPayment) => {
    const statementLine = selectedStatementLine();
    if (!statementLine) {
      toast.warning("Select a statement line first.");
      return;
    }
    setMatching(row.payment_id);
    const res = await apiFetch("/api/v1/finance/bank-reconciliation/match", {
      method: "POST",
      body: JSON.stringify({
        statement_line_id: statementLine.id,
        payment_type: row.payment_type,
        payment_id: row.payment_id,
      }),
    });
    setMatching(null);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to match statement line.");
      return;
    }
    setSelectedStatementLineId(null);
    refresh();
  };

  return (
    <FinanceLayout>
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <label class="text-sm text-slate-700">
          Bank account
          <select
            class={`${inputClass} ml-2 w-72`}
            value={bankAccountId()}
            onChange={(e) => {
              setBankAccountId(e.currentTarget.value);
              setSelectedStatementLineId(null);
            }}
          >
            <option value="">All bank accounts</option>
            <For each={accounts.data ?? []}>
              {(acc) => (
                <option value={acc.id}>
                  {acc.bank_account_code} - {acc.bank_account_name}
                </option>
              )}
            </For>
          </select>
        </label>
        <button type="button" class="rounded-lg border border-stroke px-3 py-2 text-sm hover:bg-slate-50" onClick={refresh}>
          Refresh
        </button>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <div class="rounded-xl border border-stroke">
          <div class="border-b border-stroke px-4 py-3 text-sm font-semibold">Statement lines (unmatched)</div>
          <Show when={!statements.isLoading} fallback={<p class="p-4 text-sm text-slate-500">Loading…</p>}>
            <table class="min-w-full text-sm">
              <thead class="bg-slate-50">
                <tr>
                  <th class="px-3 py-2 text-left w-8" />
                  <th class="px-3 py-2 text-left">Date</th>
                  <th class="px-3 py-2 text-left">Reference</th>
                  <th class="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <For each={statements.data ?? []}>
                  {(row) => (
                    <tr
                      class="border-t border-slate-100 cursor-pointer"
                      classList={{ "bg-brand-50": selectedStatementLineId() === row.id }}
                      onClick={() => setSelectedStatementLineId(row.id)}
                    >
                      <td class="px-3 py-2">
                        <input type="radio" checked={selectedStatementLineId() === row.id} readOnly />
                      </td>
                      <td class="px-3 py-2">{row.statement_date}</td>
                      <td class="px-3 py-2">{row.reference_no || row.description || "—"}</td>
                      <td class="px-3 py-2 text-right">{row.amount.toFixed(2)}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </Show>
        </div>

        <div class="rounded-xl border border-stroke">
          <div class="border-b border-stroke px-4 py-3 text-sm font-semibold">Unmatched payments</div>
          <Show when={!unmatched.isLoading} fallback={<p class="p-4 text-sm text-slate-500">Loading…</p>}>
            <table class="min-w-full text-sm">
              <thead class="bg-slate-50">
                <tr>
                  <th class="px-3 py-2 text-left">Date</th>
                  <th class="px-3 py-2 text-left">Document</th>
                  <th class="px-3 py-2 text-left">Partner</th>
                  <th class="px-3 py-2 text-right">Amount</th>
                  <th class="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                <For each={unmatched.data ?? []}>
                  {(row) => (
                    <tr class="border-t border-slate-100">
                      <td class="px-3 py-2">{row.payment_date}</td>
                      <td class="px-3 py-2">{row.document_no}</td>
                      <td class="px-3 py-2">{row.partner_name || "—"}</td>
                      <td class="px-3 py-2 text-right">{row.amount.toFixed(2)}</td>
                      <td class="px-3 py-2 text-right">
                        <button
                          type="button"
                          class="rounded border border-stroke px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
                          disabled={!selectedStatementLine() || matching() === row.payment_id}
                          onClick={() => void match(row)}
                        >
                          {matching() === row.payment_id ? "Matching…" : "Match"}
                        </button>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </Show>
        </div>
      </div>
    </FinanceLayout>
  );
}
