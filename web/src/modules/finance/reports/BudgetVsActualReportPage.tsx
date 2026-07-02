import { createQuery } from "@tanstack/solid-query";
import { createSignal, For, onMount, Show } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { apiFetch } from "../../../shared/api";
import { downloadReportCsv } from "../../../shared/reports/downloadReportCsv";
import { FinanceLayout } from "../FinanceLayout";

type Budget = {
  id: number;
  fiscal_year: number;
  name: string;
  status: string;
};

type BudgetVsActualRow = {
  account_id: number;
  account_code: string;
  account_name: string;
  period_month: string;
  budget: number;
  actual: number;
  variance: number;
};

type BudgetVsActualSummary = {
  budget_id: number;
  fiscal_year: number;
  name: string;
  total_budget: number;
  total_actual: number;
  variance: number;
  lines: BudgetVsActualRow[];
};

function money(n: number) {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BudgetVsActualReportPage() {
  const [searchParams] = useSearchParams();
  const initialBudget = () => {
    const raw = searchParams.budget;
    const id = Array.isArray(raw) ? raw[0] : raw;
    return id ? String(id) : "";
  };

  const [submitted, setSubmitted] = createSignal(false);
  const [budgetId, setBudgetId] = createSignal(initialBudget());
  const [generatedAt, setGeneratedAt] = createSignal(new Date());

  const budgets = createQuery(() => ({
    queryKey: ["company-budgets"],
    queryFn: async () => {
      const res = await apiFetch<Budget[]>("/api/v1/company-budget/budgets");
      if (!res.success) throw new Error(res.message ?? "Failed to load budgets");
      return res.data ?? [];
    },
  }));

  const report = createQuery(() => ({
    queryKey: ["budget-vs-actual", budgetId()],
    enabled: submitted() && !!budgetId(),
    queryFn: async () => {
      const res = await apiFetch<BudgetVsActualSummary>(
        `/api/v1/company-budget/budgets/${budgetId()}/vs-actual`,
      );
      if (!res.success) throw new Error(res.message ?? "Failed to load report");
      return res.data!;
    },
  }));

  onMount(() => {
    if (initialBudget()) setSubmitted(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F8") {
        e.preventDefault();
        search();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const search = () => {
    if (!budgetId()) return;
    setSubmitted(true);
    setGeneratedAt(new Date());
  };

  const exportUrl = () => `/api/v1/company-budget/budgets/${budgetId()}/vs-actual/export`;

  return (
    <FinanceLayout>
      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <h2 class="text-lg font-semibold text-text-primary">Budget vs Actual</h2>
        <p class="text-sm text-text-secondary">Compare budget lines to posted journal activity — Search (F8).</p>
        <div class="mt-4">
          <label class="text-sm">
            <span class="mb-1 block text-text-secondary">Budget</span>
            <select
              class="min-w-[16rem] rounded-lg border border-stroke px-3 py-2"
              value={budgetId()}
              onChange={(e) => setBudgetId(e.currentTarget.value)}
            >
              <option value="">Select budget…</option>
              <For each={budgets.data ?? []}>
                {(b) => (
                  <option value={String(b.id)}>
                    {b.fiscal_year} — {b.name} ({b.status})
                  </option>
                )}
              </For>
            </select>
          </label>
        </div>
        <div class="mt-4 flex gap-2">
          <button
            type="button"
            class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={!budgetId()}
            onClick={search}
          >
            Search (F8)
          </button>
          <button
            type="button"
            class="rounded-lg border border-stroke px-4 py-2 text-sm"
            onClick={() => {
              setBudgetId("");
              setSubmitted(false);
            }}
          >
            Reset
          </button>
        </div>
      </section>

      <Show when={submitted()}>
        <section class="mt-6 rounded-xl border border-stroke bg-white shadow-sm">
          <div class="border-b border-stroke px-5 py-4 text-center">
            <h2 class="text-xl font-bold">Budget vs Actual</h2>
            <Show when={report.data}>
              {(data) => (
                <p class="text-sm text-text-secondary">
                  {data().name} ({data().fiscal_year}) — Budget {money(data().total_budget)} / Actual{" "}
                  {money(data().total_actual)} / Variance {money(data().variance)}
                </p>
              )}
            </Show>
          </div>
          <div class="overflow-x-auto">
            <table class="erp-grid min-w-full text-left text-sm">
              <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
                <tr>
                  <th class="px-3 py-2">Account</th>
                  <th class="px-3 py-2">Name</th>
                  <th class="px-3 py-2">Period</th>
                  <th class="px-3 py-2 text-right">Budget</th>
                  <th class="px-3 py-2 text-right">Actual</th>
                  <th class="px-3 py-2 text-right">Variance</th>
                </tr>
              </thead>
              <tbody>
                <For each={report.data?.lines ?? []}>
                  {(row) => (
                    <tr class="border-t border-stroke/60">
                      <td class="px-3 py-2">{row.account_code}</td>
                      <td class="px-3 py-2">{row.account_name}</td>
                      <td class="px-3 py-2">{row.period_month}</td>
                      <td class="px-3 py-2 text-right">{money(row.budget)}</td>
                      <td class="px-3 py-2 text-right">{money(row.actual)}</td>
                      <td class="px-3 py-2 text-right">{money(row.variance)}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
            <Show when={!report.isFetching && (report.data?.lines?.length ?? 0) === 0}>
              <p class="px-5 py-8 text-center text-sm text-text-secondary">No budget lines for this budget.</p>
            </Show>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-3 border-t border-stroke px-5 py-3 text-sm">
            <span>Generated {generatedAt().toLocaleString()}</span>
            <button
              type="button"
              class="rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-brand-50"
              disabled={!budgetId()}
              onClick={() => void downloadReportCsv(exportUrl(), "budget-vs-actual.csv")}
            >
              Export CSV
            </button>
          </div>
        </section>
      </Show>
    </FinanceLayout>
  );
}
