import { createSignal, For, onMount, Show } from "solid-js";
import { formatPeso } from "../../../shared/money";
import { defaultReportDateRange, ReportPageLayout } from "../../../shared/reports/ReportPageLayout";
import { downloadReportCsv } from "../../../shared/reports/downloadReportCsv";
import {
  acctInventoryReconExportUrl,
  useAcctInventoryReconciliationReport,
  type DateRangeFilters,
} from "../../../shared/reports/useModuleReports";
import { FinanceLayout } from "../FinanceLayout";

export default function AcctInventoryReconciliationPage() {
  const defaults = defaultReportDateRange();
  const [submitted, setSubmitted] = createSignal(false);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const [filters, setFilters] = createSignal<DateRangeFilters>(defaults);

  const report = useAcctInventoryReconciliationReport(() => ({
    filters: filters(),
    enabled: submitted(),
  }));

  onMount(() => {
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
    setSubmitted(true);
    setGeneratedAt(new Date());
  };

  const summary = () => report.data?.summary;
  const accounts = () => report.data?.accounts ?? [];

  return (
    <FinanceLayout>
      <ReportPageLayout
        title="Accounting vs Inventory Reconciliation"
        description="Compare posted inventory GL (incl. PH 1200 / mapped Inventory default) to stock × purchase_price. Hybrid GL: enable under Finance setup after opening balances for existing stock. Gaps often mean draft journals, unmapped defaults, or hybrid off."
        dateFrom={() => filters().date_from ?? ""}
        dateTo={() => filters().date_to ?? ""}
        onDateFromChange={(v) => setFilters((f) => ({ ...f, date_from: v }))}
        onDateToChange={(v) => setFilters((f) => ({ ...f, date_to: v }))}
        submitted={submitted()}
        loading={report.isFetching}
        generatedAt={generatedAt()}
        onSearch={search}
        onReset={() => {
          setFilters(defaults);
          setSubmitted(false);
        }}
        onExportCsv={() => void downloadReportCsv(acctInventoryReconExportUrl(filters()), "acct-inventory-reconciliation.csv")}
      >
        <Show when={summary()}>
          {(s) => (
            <div class="grid gap-4 border-b border-stroke p-5 sm:grid-cols-2 lg:grid-cols-3">
              <div class="rounded-lg border border-stroke bg-slate-50 p-4">
                <p class="text-xs font-semibold uppercase text-text-secondary">Closing — GL inventory accounts</p>
                <p class="mt-1 text-xl font-bold text-text-primary">{formatPeso(s().acct_closing_balance)}</p>
              </div>
              <div class="rounded-lg border border-stroke bg-slate-50 p-4">
                <p class="text-xs font-semibold uppercase text-text-secondary">Closing — stock valuation</p>
                <p class="mt-1 text-xl font-bold text-text-primary">{formatPeso(s().inv_closing_valuation)}</p>
                <p class="mt-1 text-xs text-text-secondary">On-hand qty × item purchase price</p>
              </div>
              <div class="rounded-lg border border-stroke bg-slate-50 p-4">
                <p class="text-xs font-semibold uppercase text-text-secondary">Closing difference</p>
                <p class={`mt-1 text-xl font-bold ${Math.abs(s().closing_difference) > 0.01 ? "text-amber-700" : "text-emerald-700"}`}>
                  {formatPeso(s().closing_difference)}
                </p>
              </div>
              <div class="rounded-lg border border-stroke p-4">
                <p class="text-xs font-semibold uppercase text-text-secondary">Period net — GL</p>
                <p class="mt-1 text-lg font-semibold">{formatPeso(s().acct_period_net)}</p>
              </div>
              <div class="rounded-lg border border-stroke p-4">
                <p class="text-xs font-semibold uppercase text-text-secondary">Period net — inventory</p>
                <p class="mt-1 text-lg font-semibold">{formatPeso(s().inv_period_net)}</p>
              </div>
              <div class="rounded-lg border border-stroke p-4">
                <p class="text-xs font-semibold uppercase text-text-secondary">Period difference</p>
                <p class={`mt-1 text-lg font-semibold ${Math.abs(s().period_difference) > 0.01 ? "text-amber-700" : "text-emerald-700"}`}>
                  {formatPeso(s().period_difference)}
                </p>
              </div>
            </div>
          )}
        </Show>

        <table class="erp-grid min-w-full text-left text-sm">
          <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
            <tr>
              <th class="px-3 py-2">Account</th>
              <th class="px-3 py-2 text-right">Period debit</th>
              <th class="px-3 py-2 text-right">Period credit</th>
              <th class="px-3 py-2 text-right">Period net</th>
              <th class="px-3 py-2 text-right">Closing balance</th>
            </tr>
          </thead>
          <tbody>
            <For each={accounts()}>
              {(row) => (
                <tr class="border-t border-stroke/60">
                  <td class="px-3 py-2">
                    {row.account_code} — {row.account_name}
                  </td>
                  <td class="px-3 py-2 text-right">{formatPeso(row.period_debit)}</td>
                  <td class="px-3 py-2 text-right">{formatPeso(row.period_credit)}</td>
                  <td class="px-3 py-2 text-right">{formatPeso(row.period_net)}</td>
                  <td class="px-3 py-2 text-right">{formatPeso(row.closing_balance)}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
        <p class="border-t border-stroke px-5 py-3 text-xs text-text-secondary">
          Inventory accounts: Merchandise, Finished Goods, Raw Materials, Goods in transit, Work In Process. Valuation uses item purchase price; compare with trial balance when GL is fully posted.
        </p>
      </ReportPageLayout>
    </FinanceLayout>
  );
}
