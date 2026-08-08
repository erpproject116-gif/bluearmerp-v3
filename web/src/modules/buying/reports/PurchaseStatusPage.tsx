import { createSignal, For, onMount, Show } from "solid-js";
import { formatPeso } from "../../../shared/money";
import { downloadReportCsv } from "../../../shared/reports/downloadReportCsv";
import { ReportTypeTabs, type ReportType } from "../../../shared/reports/ReportTypeTabs";
import {
  defaultPurchaseStatusFilters,
  purchaseStatusExportUrl,
  type PurchaseStatusFilters,
  usePurchaseStatusReport,
} from "../../../shared/reports/usePurchaseStatusReport";
import { PurchaseStatusFilter } from "./PurchaseStatusFilter";

export default function PurchaseStatusPage() {
  const [draftFilters, setDraftFilters] = createSignal<PurchaseStatusFilters>(defaultPurchaseStatusFilters());
  const [submittedFilters, setSubmittedFilters] = createSignal<PurchaseStatusFilters>(defaultPurchaseStatusFilters());
  const [page, setPage] = createSignal(1);
  const pageSize = 50;

  const report = usePurchaseStatusReport(() => ({
    filters: submittedFilters(),
    page: page(),
    pageSize,
    enabled: true,
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
    setSubmittedFilters({ ...draftFilters() });
    setPage(1);
  };

  const reset = () => {
    const next = defaultPurchaseStatusFilters();
    setDraftFilters(next);
    setSubmittedFilters(next);
    setPage(1);
  };

  const patch = (p: Partial<PurchaseStatusFilters>) => setDraftFilters((prev) => ({ ...prev, ...p }));

  const totalPages = () => Math.max(1, Math.ceil((report.data?.total ?? 0) / pageSize));

  return (
    <div class="space-y-6">
      <PurchaseStatusFilter
        value={draftFilters}
        onChange={setDraftFilters}
        onSearch={search}
        onReset={reset}
      />
      <ReportTypeTabs
        value={() => draftFilters().report_type}
        onChange={(t) => patch({ report_type: t as ReportType })}
        labels={{ details: "Date" }}
      />
      <section class="rounded-xl border border-stroke bg-white shadow-sm">
          <div class="border-b border-stroke px-5 py-4 text-center">
            <h2 class="text-xl font-bold text-text-primary">Purchase Status</h2>
          </div>
          <div class="overflow-x-auto">
            <table class="erp-grid min-w-full text-left text-sm">
              <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
                <tr>
                  <th class="px-3 py-2">Date-No.</th>
                  <th class="px-3 py-2">Invoice No.</th>
                  <th class="px-3 py-2">Progress</th>
                  <th class="px-3 py-2">Vendor</th>
                  <th class="px-3 py-2">Item Code</th>
                  <th class="px-3 py-2">Item Name</th>
                  <th class="px-3 py-2 text-right">Qty</th>
                  <th class="px-3 py-2 text-right">Line Total</th>
                </tr>
              </thead>
              <tbody>
                <Show when={report.isFetching}>
                  <tr><td colSpan={8} class="px-3 py-8 text-center text-text-secondary">Loading…</td></tr>
                </Show>
                <For each={report.data?.rows ?? []}>
                  {(row) => (
                    <tr class="border-t border-stroke/60">
                      <td class="px-3 py-2">{row.date_no_display}</td>
                      <td class="px-3 py-2">{row.invoice_no}</td>
                      <td class="px-3 py-2">{row.progress_status}</td>
                      <td class="px-3 py-2">{row.vendor_name}</td>
                      <td class="px-3 py-2">{row.item_code}</td>
                      <td class="px-3 py-2">{row.item_name}</td>
                      <td class="px-3 py-2 text-right">{row.qty}</td>
                      <td class="px-3 py-2 text-right">{formatPeso(row.line_total)}</td>
                    </tr>
                  )}
                </For>
              </tbody>
              <tfoot class="border-t-2 border-stroke bg-slate-50 font-semibold">
                <tr>
                  <td colSpan={6} class="px-3 py-2 text-right">Total</td>
                  <td class="px-3 py-2 text-right">{report.data?.summary.total_qty ?? 0}</td>
                  <td class="px-3 py-2 text-right">{formatPeso(report.data?.summary.total_amount ?? 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-3 border-t border-stroke px-5 py-3 text-sm">
            <span>Page {page()} / {totalPages()}</span>
            <div class="flex gap-2">
              <button type="button" class="rounded border border-stroke px-3 py-1 disabled:opacity-50" disabled={page() <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
              <button type="button" class="rounded border border-stroke px-3 py-1 disabled:opacity-50" disabled={page() >= totalPages()} onClick={() => setPage((p) => p + 1)}>Next</button>
              <button type="button" class="rounded border border-stroke px-3 py-1" onClick={() => void downloadReportCsv(purchaseStatusExportUrl(submittedFilters()), "purchase-status.csv")}>Export CSV</button>
            </div>
          </div>
        </section>
    </div>
  );
}
