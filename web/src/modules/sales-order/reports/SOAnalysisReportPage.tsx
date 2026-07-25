import { createSignal, For, onMount, Show } from "solid-js";
import { defaultReportDateRange, ReportPageLayout } from "../../../shared/reports/ReportPageLayout";
import { downloadReportCsv } from "../../../shared/reports/downloadReportCsv";
import {
  soAnalysisExportUrl,
  useSOAnalysisReport,
  type DateRangeFilters,
} from "../../../shared/reports/useModuleReports";
import { formatMoney } from "../../../shared/money";
import { SalesOrderLayout } from "../SalesOrderLayout";

export default function SOAnalysisReportPage() {
  const defaults = defaultReportDateRange();
  const [submitted, setSubmitted] = createSignal(false);
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const [filters, setFilters] = createSignal<DateRangeFilters>(defaults);
  const pageSize = 50;

  const report = useSOAnalysisReport(() => ({
    filters: filters(),
    page: page(),
    pageSize,
    sort: "total_amount",
    order: "desc",
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

  const totalPages = () => Math.max(1, Math.ceil((report.data?.total ?? 0) / pageSize));

  return (
    <SalesOrderLayout>
      <ReportPageLayout
        title="Sales Order Analysis"
        description="Order counts and totals by customer — Search (F8)."
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
        onSearch={search}
        onReset={() => {
          setFilters(defaults);
          setSubmitted(false);
          setPage(1);
        }}
        onExportCsv={() => void downloadReportCsv(soAnalysisExportUrl(filters()), "so-analysis.csv")}
      >
        <table class="erp-grid min-w-full text-left text-sm">
          <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
            <tr>
              <th class="px-3 py-2">Customer</th>
              <th class="px-3 py-2 text-right">Orders</th>
              <th class="px-3 py-2 text-right">Unconfirmed</th>
              <th class="px-3 py-2 text-right">In Progress</th>
              <th class="px-3 py-2 text-right">Completed</th>
              <th class="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            <For each={report.data?.rows ?? []}>
              {(row) => (
                <tr class="border-t border-stroke/60">
                  <td class="px-3 py-2">{row.customer_name}</td>
                  <td class="px-3 py-2 text-right">{row.order_count}</td>
                  <td class="px-3 py-2 text-right">{row.unconfirmed_count}</td>
                  <td class="px-3 py-2 text-right">{row.in_progress_count}</td>
                  <td class="px-3 py-2 text-right">{row.completed_count}</td>
                  <td class="px-3 py-2 text-right">{formatMoney(row.total_amount)}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
        <Show when={submitted() && (report.data?.rows?.length ?? 0) === 0 && !report.isFetching}>
          <p class="px-5 py-8 text-center text-sm text-text-secondary">No sales orders in this date range.</p>
        </Show>
      </ReportPageLayout>
    </SalesOrderLayout>
  );
}
