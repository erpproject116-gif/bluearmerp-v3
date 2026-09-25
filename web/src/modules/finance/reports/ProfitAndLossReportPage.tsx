import { createSignal, For, onMount, Show } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { defaultReportDateRange, ReportPageLayout } from "../../../shared/reports/ReportPageLayout";
import { queryParamFirst } from "../../../shared/reports/ReportDatePresets";
import {
  profitAndLossExportUrl,
  useProfitAndLossReport,
  type DateRangeFilters,
} from "../../../shared/reports/useModuleReports";
import { FinanceLayout } from "../FinanceLayout";
import { downloadReportCsv } from "../../../shared/reports/downloadReportCsv";
import { MoneyCell } from "../../../shared/MoneyCell";
import { formatMoney } from "../../../shared/money";

export default function ProfitAndLossReportPage() {
  const [params] = useSearchParams();
  const defaults = defaultReportDateRange();
  const initial = {
    date_from: queryParamFirst(params.date_from) || queryParamFirst(params.from_date) || defaults.date_from,
    date_to: queryParamFirst(params.date_to) || queryParamFirst(params.to_date) || defaults.date_to,
  };
  const [submitted, setSubmitted] = createSignal(true);
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const [filters, setFilters] = createSignal<DateRangeFilters>(initial);
  const [pageSize, setPageSize] = createSignal(50);

  const report = useProfitAndLossReport(() => ({
    filters: filters(),
    page: page(),
    pageSize: pageSize(),
    sort: "account_code",
    order: "asc",
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
    setPage(1);
    setGeneratedAt(new Date());
  };

  const totalPages = () => Math.max(1, Math.ceil((report.data?.total ?? 0) / pageSize()));

  return (
    <FinanceLayout>
      <ReportPageLayout
        title="Profit & Loss"
        description="Income and expense accounts for the period — Search (F8)."
        dateFrom={() => filters().date_from ?? ""}
        dateTo={() => filters().date_to ?? ""}
        onDateFromChange={(v) => setFilters((f) => ({ ...f, date_from: v }))}
        onDateToChange={(v) => setFilters((f) => ({ ...f, date_to: v }))}
        submitted={submitted()}
        loading={report.isFetching}
        generatedAt={generatedAt()}
        page={page()}
        totalPages={totalPages()}
        onPageChange={setPage}
      pageSize={pageSize()} onPageSizeChange={setPageSize}
        onSearch={search}
        onReset={() => {
          setFilters(defaults);
          setSubmitted(true);
          setPage(1);
        }}
        onExportCsv={() => void downloadReportCsv(profitAndLossExportUrl(filters()), "profit-and-loss.csv")}
      >
        <Show when={submitted() && report.data?.hasJournalData === false}>
          <p class="px-5 py-4 text-sm text-amber-700">No posted journal entries yet.</p>
        </Show>
        <table class="erp-grid min-w-full text-left text-sm">
          <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
            <tr>
              <th class="px-3 py-2">Account</th>
              <th class="px-3 py-2">Name</th>
              <th class="px-3 py-2">Type</th>
              <th class="px-3 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <For each={report.data?.rows ?? []}>
              {(row) => (
                <tr class="border-t border-stroke/60">
                  <td class="px-3 py-2">{row.account_code}</td>
                  <td class="px-3 py-2">{row.account_name}</td>
                  <td class="px-3 py-2">{row.account_type}</td>
                  <MoneyCell value={row.amount} />
                </tr>
              )}
            </For>
          </tbody>
          <Show when={submitted() && report.data?.totalAmount != null}>
            <tfoot>
              <tr class="border-t-2 border-stroke bg-brand-50/60 text-sm font-semibold text-brand-800">
                <td class="px-3 py-2" colspan="3">
                  Net total
                </td>
                <td class="px-3 py-2 text-right tabular-nums">{formatMoney(report.data?.totalAmount ?? 0)}</td>
              </tr>
            </tfoot>
          </Show>
        </table>
      </ReportPageLayout>
    </FinanceLayout>
  );
}
