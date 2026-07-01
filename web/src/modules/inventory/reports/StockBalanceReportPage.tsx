import { createSignal, For, onMount, Show } from "solid-js";
import { ReportPageLayout } from "../../../shared/reports/ReportPageLayout";
import { downloadReportCsv } from "../../../shared/reports/downloadReportCsv";
import { stockBalanceExportUrl, useStockBalanceReport } from "../../../shared/reports/useModuleReports";

export default function StockBalanceReportPage() {
  const [submitted, setSubmitted] = createSignal(false);
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const pageSize = 50;

  const report = useStockBalanceReport(() => ({
    filters: {},
    page: page(),
    pageSize,
    sort: "item_code",
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

  const totalPages = () => Math.max(1, Math.ceil((report.data?.total ?? 0) / pageSize));

  return (
    <ReportPageLayout
      title="Stock Balance"
      description="On-hand and reserved quantity by item and location — Search (F8)."
      showDateFilters={false}
      submitted={submitted()}
      loading={report.isFetching}
      generatedAt={generatedAt()}
      page={page()}
      totalPages={totalPages()}
      onPageChange={setPage}
      onSearch={search}
      onReset={() => {
        setSubmitted(false);
        setPage(1);
      }}
      onExportCsv={() => void downloadReportCsv(stockBalanceExportUrl(), "stock-balance.csv")}
    >
      <table class="erp-grid min-w-full text-left text-sm">
        <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
          <tr>
            <th class="px-3 py-2">Item</th>
            <th class="px-3 py-2">Location</th>
            <th class="px-3 py-2 text-right">On Hand</th>
            <th class="px-3 py-2 text-right">Reserved</th>
            <th class="px-3 py-2 text-right">Available</th>
          </tr>
        </thead>
        <tbody>
          <For each={report.data?.rows ?? []}>
            {(row) => (
              <tr class="border-t border-stroke/60">
                <td class="px-3 py-2">
                  {row.item_code} — {row.item_name}
                </td>
                <td class="px-3 py-2">{row.location_name}</td>
                <td class="px-3 py-2 text-right">{row.qty_on_hand}</td>
                <td class="px-3 py-2 text-right">{row.qty_reserved}</td>
                <td class="px-3 py-2 text-right">{row.available_qty}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <Show when={submitted() && (report.data?.rows?.length ?? 0) === 0 && !report.isFetching}>
        <p class="px-5 py-8 text-center text-sm text-text-secondary">No stock balances found.</p>
      </Show>
    </ReportPageLayout>
  );
}
