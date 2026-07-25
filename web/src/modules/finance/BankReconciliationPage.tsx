import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { formatMoney } from "../../shared/money";
import { inputClass } from "../../shared/SpreadsheetGrid";
import { GridExportButtons } from "../../shared/gridExport";
import { useToast } from "../../shared/toast";
import { FinanceLayout } from "./FinanceLayout";
import { uiLabel } from "../../shared/branding/uiLabel";

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
  const [pendingMatch, setPendingMatch] = createSignal<UnmatchedPayment | null>(null);

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

  createEffect(() => {
    const list = accounts.data;
    if (!list || list.length !== 1 || bankAccountId()) return;
    setBankAccountId(String(list[0].id));
  });

  const statementCount = createMemo(() => (statements.data ?? []).length);
  const unmatchedCount = createMemo(() => (unmatched.data ?? []).length);

  const sortedUnmatched = createMemo(() => {
    const stmt = selectedStatementLine();
    const rows = [...(unmatched.data ?? [])];
    if (!stmt) return rows;
    return rows.sort((a, b) => Math.abs(a.amount - stmt.amount) - Math.abs(b.amount - stmt.amount));
  });

  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["finance-bank-recon-statements"] });
    void client.invalidateQueries({ queryKey: ["finance-bank-recon-unmatched"] });
  };

  const amountDelta = createMemo(() => {
    const stmt = selectedStatementLine();
    const pay = pendingMatch();
    if (!stmt || !pay) return null;
    return Math.abs(stmt.amount - pay.amount);
  });

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
    toast.success("Statement line matched.");
    setPendingMatch(null);
    setSelectedStatementLineId(null);
    refresh();
  };

  return (
    <FinanceLayout>
      <div class="mb-4 rounded-xl border border-stroke bg-slate-50 px-4 py-3 text-sm text-text-secondary">
        <p class="font-medium text-text-primary">Weekly bank reconciliation</p>
        <ol class="mt-2 list-decimal space-y-1 pl-5">
          <li>Select a bank account (or leave All to scan every account).</li>
          <li>Click an unmatched statement line on the left.</li>
          <li>Match a payment on the right — closest amounts are listed first.</li>
        </ol>
      </div>

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
        <GridExportButtons
          title="Bank Reconciliation — Unmatched Statement Lines"
          filename="bank-recon-statement-lines"
          columns={[
            { key: "statement_date", header: "Date", value: (r) => String(r.statement_date ?? "") },
            { key: "reference", header: "Reference", value: (r) => String(r.reference_no || r.description || "") },
            { key: "amount", header: "Amount", value: (r) => Number(r.amount ?? 0) },
          ]}
          rows={() => (statements.data ?? []) as unknown as Record<string, unknown>[]}
        />
        <GridExportButtons
          title="Bank Reconciliation — Unmatched Payments"
          filename="bank-recon-unmatched-payments"
          columns={[
            { key: "payment_date", header: "Date", value: (r) => String(r.payment_date ?? "") },
            { key: "document_no", header: "Document", value: (r) => String(r.document_no ?? "") },
            { key: "partner_name", header: "Partner", value: (r) => String(r.partner_name ?? "") },
            { key: "payment_method", header: "Method", value: (r) => String(r.payment_method ?? "") },
            { key: "amount", header: "Amount", value: (r) => Number(r.amount ?? 0) },
          ]}
          rows={() => (unmatched.data ?? []) as unknown as Record<string, unknown>[]}
        />
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <div class="rounded-xl border border-stroke">
          <div class="flex items-center justify-between border-b border-stroke px-4 py-3">
            <div class="text-sm font-semibold">Statement lines (unmatched)</div>
            <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-text-secondary">{statementCount()}</span>
          </div>
          <Show when={!statements.isLoading} fallback={<p class="p-4 text-sm text-slate-500">{uiLabel("common.loading")}</p>}>
            <Show
              when={(statements.data ?? []).length > 0}
              fallback={<p class="p-4 text-sm text-text-secondary">No unmatched statement lines. Import a bank statement or clear filters.</p>}
            >
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
                      <td class="px-3 py-2 text-right">{formatMoney(row.amount)}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
            </Show>
          </Show>
        </div>

        <div class="rounded-xl border border-stroke">
          <div class="flex items-center justify-between border-b border-stroke px-4 py-3">
            <div class="text-sm font-semibold">Unmatched payments</div>
            <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-text-secondary">{unmatchedCount()}</span>
          </div>
          <Show when={!unmatched.isLoading} fallback={<p class="p-4 text-sm text-slate-500">{uiLabel("common.loading")}</p>}>
            <Show
              when={sortedUnmatched().length > 0}
              fallback={<p class="p-4 text-sm text-text-secondary">No unmatched official receipts or payment vouchers for this filter.</p>}
            >
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
                <For each={sortedUnmatched()}>
                  {(row) => (
                    <tr class="border-t border-slate-100">
                      <td class="px-3 py-2">{row.payment_date}</td>
                      <td class="px-3 py-2">{row.document_no}</td>
                      <td class="px-3 py-2">{row.partner_name || "—"}</td>
                      <td class="px-3 py-2 text-right">{formatMoney(row.amount)}</td>
                      <td class="px-3 py-2 text-right">
                        <button
                          type="button"
                          class="rounded border border-stroke px-2 py-1 text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={!selectedStatementLine()}
                          title={selectedStatementLine() ? "Match to selected statement line" : "Select a statement line first"}
                          onClick={() => setPendingMatch(row)}
                        >
                          Match…
                        </button>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
            </Show>
          </Show>
        </div>
      </div>

      <Show when={pendingMatch() && selectedStatementLine()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div class="w-full max-w-md rounded-xl border border-stroke bg-white p-5 shadow-lg">
            <h3 class="text-lg font-semibold text-text-primary">Confirm match</h3>
            <div class="mt-3 space-y-2 text-sm text-text-secondary">
              <p>Statement: {selectedStatementLine()!.reference_no || selectedStatementLine()!.description || "—"} — {formatMoney(selectedStatementLine()!.amount)}</p>
              <p>Payment: {pendingMatch()!.document_no} — {formatMoney(pendingMatch()!.amount)}</p>
              <Show when={(amountDelta() ?? 0) > 0.01}>
                <p class="font-medium text-amber-700">Amount difference: {formatMoney(amountDelta()!)}</p>
              </Show>
            </div>
            <div class="mt-4 flex justify-end gap-2">
              <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={() => setPendingMatch(null)}>Cancel</button>
              <button
                type="button"
                class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={matching() !== null}
                onClick={() => pendingMatch() && void match(pendingMatch()!)}
              >
                {matching() !== null ? "Matching…" : "Confirm match"}
              </button>
            </div>
          </div>
        </div>
      </Show>
    </FinanceLayout>
  );
}
