import { createSignal, For, onMount, Show } from "solid-js";
import { defaultReportDateRange, ReportPageLayout } from "../../../shared/reports/ReportPageLayout";
import { downloadReportCsv } from "../../../shared/reports/downloadReportCsv";
import {
  expiredQuotationsExportUrl,
  useExpiredQuotationsReport,
  type ExpiredQuotationsFilters,
} from "../../../shared/useCrmReports";
import { formatMoney } from "../../../shared/money";
import { CrmLayout } from "../CrmLayout";

export default function ExpiredQuotationsReportPage() {
  const defaults = defaultReportDateRange();
  const [submitted, setSubmitted] = createSignal(false);
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const [filters, setFilters] = createSignal<ExpiredQuotationsFilters>(defaults);
  const pageSize = 50;

  const report = useExpiredQuotationsReport(() => ({
    filters: filters(),
    page: page(),
    pageSize,
    sort: "valid_until",
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
    <CrmLayout>
      <ReportPageLayout
        title="Expired Quotations"
        description="Quotation lines past validity date — optional order date filter — Search (F8)."
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
        onExportCsv={() => void downloadReportCsv(expiredQuotationsExportUrl(filters()), "expired-quotations.csv")}
      >
        <table class="erp-grid min-w-full text-left text-sm">
          <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
            <tr>
              <th class="px-3 py-2">Reference</th>
              <th class="px-3 py-2">Customer</th>
              <th class="px-3 py-2">Valid Until</th>
              <th class="px-3 py-2">Item</th>
              <th class="px-3 py-2 text-right">Qty</th>
              <th class="px-3 py-2 text-right">Line Total</th>
            </tr>
          </thead>
          <tbody>
            <For each={report.data?.rows ?? []}>
              {(row) => (
                <tr class="border-t border-stroke/60">
                  <td class="px-3 py-2">{row.reference_no}</td>
                  <td class="px-3 py-2">{row.customer_name}</td>
                  <td class="px-3 py-2 text-red-600">{row.valid_until ?? "—"}</td>
                  <td class="px-3 py-2">
                    {row.item_code} — {row.item_name}
                  </td>
                  <td class="px-3 py-2 text-right">{row.qty}</td>
                  <td class="px-3 py-2 text-right">{formatMoney(row.line_total)}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
        <Show when={submitted() && (report.data?.rows?.length ?? 0) === 0 && !report.isFetching}>
          <p class="px-5 py-8 text-center text-sm text-text-secondary">No expired quotation lines found.</p>
        </Show>
      </ReportPageLayout>
    </CrmLayout>
  );
}
