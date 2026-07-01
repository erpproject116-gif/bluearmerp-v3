import { createSignal, For, onMount, Show } from "solid-js";
import { defaultReportDateRange, ReportPageLayout } from "../../../shared/reports/ReportPageLayout";
import { downloadReportCsv } from "../../../shared/reports/downloadReportCsv";
import {
  stockLedgerExportUrl,
  useStockLedgerReport,
  type DateRangeFilters,
} from "../../../shared/reports/useModuleReports";

export default function StockLedgerReportPage() {
  const defaults = defaultReportDateRange();
  const [submitted, setSubmitted] = createSignal(false);
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const [filters, setFilters] = createSignal<DateRangeFilters>(defaults);
  const pageSize = 50;

  const report = useStockLedgerReport(() => ({
    filters: filters(),
    page: page(),
    pageSize,
    sort: "created_at",
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
    <ReportPageLayout
      title="Stock Ledger"
      description="Stock movement history — Search (F8)."
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
      onExportCsv={() => void downloadReportCsv(stockLedgerExportUrl(filters()), "stock-ledger.csv")}
    >
      <table class="erp-grid min-w-full text-left text-sm">
        <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
          <tr>
            <th class="px-3 py-2">Date</th>
            <th class="px-3 py-2">Item</th>
            <th class="px-3 py-2">Location</th>
            <th class="px-3 py-2 text-right">Qty Delta</th>
            <th class="px-3 py-2">Type</th>
            <th class="px-3 py-2">Ref</th>
            <th class="px-3 py-2">Reason</th>
          </tr>
        </thead>
        <tbody>
          <For each={report.data?.rows ?? []}>
            {(row) => (
              <tr class="border-t border-stroke/60">
                <td class="px-3 py-2">{row.created_at}</td>
                <td class="px-3 py-2">
                  {row.item_code} — {row.item_name}
                </td>
                <td class="px-3 py-2">{row.location_name}</td>
                <td class="px-3 py-2 text-right">{row.qty_delta}</td>
                <td class="px-3 py-2">{row.movement_type}</td>
                <td class="px-3 py-2">{row.ref_type}</td>
                <td class="px-3 py-2">{row.reason ?? ""}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <Show when={submitted() && (report.data?.rows?.length ?? 0) === 0 && !report.isFetching}>
        <p class="px-5 py-8 text-center text-sm text-text-secondary">No movements in this date range.</p>
      </Show>
    </ReportPageLayout>
  );
}
