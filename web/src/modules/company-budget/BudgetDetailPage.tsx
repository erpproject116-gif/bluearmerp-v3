import { A, useNavigate, useParams } from "@solidjs/router";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { LookupCombo, type LookupOption } from "../../shared/LookupCombo";
import { EntityModal, Field, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { CompanyBudgetLayout } from "./CompanyBudgetLayout";

type Budget = {
  id: number;
  fiscal_year: number;
  name: string;
  status: string;
};

type BudgetLine = {
  id: number;
  budget_id: number;
  account_id: number;
  period_month: string;
  amount: number;
};

async function fetchAccounts(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", sort: "account_code", order: "asc" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; account_code: string; account_name: string }[]>(
    `/api/v1/finance/accounts?${qs}`,
  );
  return (res.data ?? []).map((a) => ({ id: a.id, label: `${a.account_code} — ${a.account_name}` }));
}

function monthToPeriod(monthValue: string): string {
  if (!monthValue) return "";
  return `${monthValue}-01`;
}

export default function BudgetDetailPage() {
  const params = useParams();
  const navigate = useNavigate();
  const budgetId = () => Number(params.id);
  const toast = useToast();
  const client = useQueryClient();

  const [lineModalOpen, setLineModalOpen] = createSignal(false);
  const [accountId, setAccountId] = createSignal<number | null>(null);
  const [accountLabel, setAccountLabel] = createSignal("");
  const [periodMonth, setPeriodMonth] = createSignal("");
  const [amount, setAmount] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [activating, setActivating] = createSignal(false);

  const budget = createQuery(() => ({
    queryKey: ["company-budget", budgetId()],
    enabled: Number.isFinite(budgetId()) && budgetId() > 0,
    queryFn: async () => {
      const res = await apiFetch<Budget[]>("/api/v1/company-budget/budgets");
      if (!res.success) throw new Error(res.message ?? "Failed to load budget");
      const row = (res.data ?? []).find((b) => b.id === budgetId());
      if (!row) throw new Error("Budget not found");
      return row;
    },
  }));

  const lines = createQuery(() => ({
    queryKey: ["company-budget-lines", budgetId()],
    enabled: Number.isFinite(budgetId()) && budgetId() > 0,
    queryFn: async () => {
      const res = await apiFetch<BudgetLine[]>(`/api/v1/company-budget/budgets/${budgetId()}/lines`);
      if (!res.success) throw new Error(res.message ?? "Failed to load lines");
      return res.data ?? [];
    },
  }));

  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ["company-budget-lines", budgetId()] });
    void client.invalidateQueries({ queryKey: ["company-budget", budgetId()] });
    void client.invalidateQueries({ queryKey: ["company-budgets"] });
  };

  const openLineModal = () => {
    setAccountId(null);
    setAccountLabel("");
    setPeriodMonth("");
    setAmount("");
    setLineModalOpen(true);
  };

  const saveLine = async () => {
    if (!accountId() || !periodMonth() || !amount()) {
      toast.warning("Account, period month, and amount are required.");
      return;
    }
    setSaving(true);
    const res = await apiFetch(`/api/v1/company-budget/budgets/${budgetId()}/lines`, {
      method: "POST",
      body: JSON.stringify({
        account_id: accountId(),
        period_month: monthToPeriod(periodMonth()),
        amount: Number(amount()),
      }),
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to add line.");
      return;
    }
    toast.success("Budget line added.");
    setLineModalOpen(false);
    invalidate();
  };

  const activate = async () => {
    setActivating(true);
    const res = await apiFetch(`/api/v1/company-budget/budgets/${budgetId()}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "active" }),
    });
    setActivating(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to activate budget.");
      return;
    }
    toast.success("Budget activated.");
    invalidate();
  };

  return (
    <CompanyBudgetLayout>
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          class="text-sm text-brand-600 hover:underline"
          onClick={() => navigate("/app/finance/budgets")}
        >
          ← Back to budgets
        </button>
        <Show when={budget.data}>
          {(b) => (
            <>
              <h2 class="text-lg font-semibold text-text-primary">
                {b().name} ({b().fiscal_year})
              </h2>
              <span class="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium capitalize text-brand-700">
                {b().status}
              </span>
              <Show when={b().status !== "active"}>
                <button
                  type="button"
                  class="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                  disabled={activating()}
                  onClick={() => void activate()}
                >
                  Activate
                </button>
              </Show>
              <A
                href={`/app/finance/reports/budget-vs-actual?budget=${budgetId()}`}
                class="text-sm text-brand-600 hover:underline"
              >
                Budget vs Actual report
              </A>
            </>
          )}
        </Show>
      </div>

      <div class="mb-3 flex justify-end">
        <button
          type="button"
          class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white"
          onClick={openLineModal}
        >
          + Add line
        </button>
      </div>

      <div class="overflow-x-auto rounded-xl border border-stroke bg-white shadow-sm">
        <table class="erp-grid min-w-full text-left text-sm">
          <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
            <tr>
              <th class="px-3 py-2">Account ID</th>
              <th class="px-3 py-2">Period</th>
              <th class="px-3 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <For each={lines.data ?? []}>
              {(row) => (
                <tr class="border-t border-stroke/60">
                  <td class="px-3 py-2">{row.account_id}</td>
                  <td class="px-3 py-2">{row.period_month}</td>
                  <td class="px-3 py-2 text-right">{row.amount.toLocaleString()}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
        <Show when={!lines.isFetching && (lines.data?.length ?? 0) === 0}>
          <p class="px-5 py-8 text-center text-sm text-text-secondary">No budget lines yet.</p>
        </Show>
      </div>

      <EntityModal
        open={lineModalOpen()}
        title="Add budget line"
        onClose={() => setLineModalOpen(false)}
        onSave={() => void saveLine()}
        saving={saving()}
        singleColumn
      >
        <LookupCombo
          label="Account"
          required
          value={() => accountLabel()}
          selectedId={() => accountId()}
          onInput={setAccountLabel}
          onSelect={(o) => {
            setAccountId(o.id);
            setAccountLabel(o.label);
          }}
          onClear={() => {
            setAccountId(null);
            setAccountLabel("");
          }}
          fetchOptions={fetchAccounts}
        />
        <Field label="Period month *">
          <input
            type="month"
            class={inputClass}
            value={periodMonth()}
            onInput={(e) => setPeriodMonth(e.currentTarget.value)}
          />
        </Field>
        <Field label="Amount *">
          <input
            type="number"
            step="0.01"
            class={inputClass}
            value={amount()}
            onInput={(e) => setAmount(e.currentTarget.value)}
          />
        </Field>
      </EntityModal>
    </CompanyBudgetLayout>
  );
}
