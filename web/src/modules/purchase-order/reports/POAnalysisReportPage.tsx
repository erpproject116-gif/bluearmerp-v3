import { createSignal, For, onMount, Show } from "solid-js";
import { defaultReportDateRange, ReportPageLayout } from "../../../shared/reports/ReportPageLayout";
import { downloadReportCsv } from "../../../shared/reports/downloadReportCsv";
import {
  poAnalysisExportUrl,
  usePOAnalysisReport,
  type DateRangeFilters,
} from "../../../shared/reports/useModuleReports";
import { formatMoney } from "../../../shared/money";
import { PurchaseRequestLayout } from "../../purchase-request/PurchaseRequestLayout";

export default function POAnalysisReportPage() {
  const defaults = defaultReportDateRange();
  const [submitted, setSubmitted] = createSignal(true);
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const [filters, setFilters] = createSignal<DateRangeFilters>(defaults);
  const [pageSize, setPageSize] = createSignal(50);

  const report = usePOAnalysisReport(() => ({
    filters: filters(),
    page: page(),
    pageSize: pageSize(),
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

  const totalPages = () => Math.max(1, Math.ceil((report.data?.total ?? 0) / pageSize()));

  return (
    <PurchaseRequestLayout>
      <ReportPageLayout
        title="Purchase Order Analysis"
        description="PO counts and totals by vendor — Search (F8)."
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
        onExportCsv={() => void downloadReportCsv(poAnalysisExportUrl(filters()), "po-analysis.csv")}
      >
        <table class="erp-grid min-w-full text-left text-sm">
          <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
            <tr>
              <th class="px-3 py-2">Vendor</th>
              <th class="px-3 py-2 text-right">Orders</th>
              <th class="px-3 py-2 text-right">Confirmed</th>
              <th class="px-3 py-2 text-right">Partial</th>
              <th class="px-3 py-2 text-right">Received</th>
              <th class="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            <For each={report.data?.rows ?? []}>
              {(row) => (
                <tr class="border-t border-stroke/60">
                  <td class="px-3 py-2">{row.vendor_name}</td>
                  <td class="px-3 py-2 text-right">{row.order_count}</td>
                  <td class="px-3 py-2 text-right">{row.confirmed_count}</td>
                  <td class="px-3 py-2 text-right">{row.partial_count}</td>
                  <td class="px-3 py-2 text-right">{row.received_count}</td>
                  <td class="px-3 py-2 text-right">{formatMoney(row.total_amount)}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
        <Show when={submitted() && (report.data?.rows?.length ?? 0) === 0 && !report.isFetching}>
          <p class="px-5 py-8 text-center text-sm text-text-secondary">No purchase orders in this date range.</p>
        </Show>
      </ReportPageLayout>
    </PurchaseRequestLayout>
  );
}
