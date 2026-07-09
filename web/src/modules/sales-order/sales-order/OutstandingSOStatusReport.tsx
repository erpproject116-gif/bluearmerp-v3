import { For, Show } from "solid-js";
import { formatPeso } from "../../../shared/money";
import { useAuth } from "../../../shared/auth-context";
import { getAccessToken } from "../../../shared/api";
import { formatDisplayDate, outstandingExportUrl, type OutstandingSOFilters } from "./salesOrderStatusFilters";
import type { SalesOrderOutstandingReportRow } from "../../../shared/useSalesOrderOutstandingReport";
import { progressStatusLabel } from "./progressStatus";
import { ReportEmptyRow, ReportLoadingRow } from "../../../shared/reports/ReportTableStates";

type Props = {
  filters: OutstandingSOFilters;
  rows: SalesOrderOutstandingReportRow[];
  totalBalanceQty: number;
  totalAmount: number;
  totalRows: number;
  page: number;
  pageSize: number;
  loading: boolean;
  generatedAt: () => Date;
  onPageChange: (page: number) => void;
};



export function OutstandingSOStatusReport(props: Props) {
  const auth = useAuth();
  const companyName = () => auth.me?.tenant.company_name ?? "Company";
  const totalPages = () => Math.max(1, Math.ceil(props.totalRows / props.pageSize));

  const downloadCsv = async () => {
    const token = await getAccessToken();
    const res = await fetch(outstandingExportUrl(props.filters), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "outstanding-so-status.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section class="mt-6 rounded-xl border border-stroke bg-white shadow-sm">
      <div class="border-b border-stroke px-5 py-4 text-center">
        <h2 class="text-xl font-bold text-text-primary">Outstanding SO Status</h2>
        <div class="mt-2 flex flex-wrap justify-between gap-2 text-sm text-text-secondary">
          <span>Company Name : {companyName()}</span>
          <span>
            {formatDisplayDate(props.filters.date_from)} ~ {formatDisplayDate(props.filters.date_to)}
          </span>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="erp-grid min-w-full text-left text-sm">
          <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
            <tr>
              <th class="px-3 py-2">Date-No.</th>
              <th class="px-3 py-2">Sales Order No.</th>
              <th class="px-3 py-2">Progress</th>
              <th class="px-3 py-2">Customer</th>
              <th class="px-3 py-2">Location</th>
              <th class="px-3 py-2">Item Code</th>
              <th class="px-3 py-2">Item Name</th>
              <th class="px-3 py-2 text-right">Qty</th>
              <th class="px-3 py-2 text-right">Balance</th>
              <th class="px-3 py-2 text-right">Loc. Stock</th>
              <th class="px-3 py-2 text-right">Total Stock</th>
              <th class="px-3 py-2">Delivery Date</th>
              <th class="px-3 py-2 text-right">Line Total</th>
            </tr>
          </thead>
          <tbody>
            <Show when={props.loading}>
              <ReportLoadingRow colSpan={13} />
            </Show>
            <Show when={!props.loading && props.rows.length === 0}>
              <ReportEmptyRow colSpan={13} />
            </Show>
            <For each={props.rows}>
              {(row) => (
                <tr class="border-t border-stroke/60 hover:bg-slate-50/50">
                  <td class="px-3 py-2">{row.date_no_display}</td>
                  <td class="px-3 py-2">{row.sales_order_no}</td>
                  <td class="px-3 py-2">{progressStatusLabel(row.progress_status)}</td>
                  <td class="px-3 py-2">{row.customer_name}</td>
                  <td class="px-3 py-2">{row.location_name}</td>
                  <td class="px-3 py-2">{row.item_code}</td>
                  <td class="px-3 py-2">{row.item_name}</td>
                  <td class="px-3 py-2 text-right">{row.qty}</td>
                  <td class="px-3 py-2 text-right">{row.balance_qty}</td>
                  <td class="px-3 py-2 text-right">{row.location_stock}</td>
                  <td class="px-3 py-2 text-right">{row.total_stock}</td>
                  <td class="px-3 py-2">{row.delivery_date ?? ""}</td>
                  <td class="px-3 py-2 text-right">{formatPeso(row.line_total)}</td>
                </tr>
              )}
            </For>
          </tbody>
          <tfoot class="border-t-2 border-stroke bg-slate-50 font-semibold">
            <tr>
              <td colSpan={8} class="px-3 py-2 text-right">
                Total
              </td>
              <td class="px-3 py-2 text-right">{props.totalBalanceQty}</td>
              <td colSpan={3} />
              <td class="px-3 py-2 text-right">{formatPeso(props.totalAmount)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3 border-t border-stroke px-5 py-3 text-xs text-text-secondary">
        <span>[P.{props.page}]</span>
        <span>{props.generatedAt().toLocaleString()}</span>
        <div class="flex gap-2">
          <button type="button" class="rounded border border-stroke px-2 py-1 disabled:opacity-40" disabled={props.page <= 1} onClick={() => props.onPageChange(props.page - 1)}>
            Prev
          </button>
          <button type="button" class="rounded border border-stroke px-2 py-1 disabled:opacity-40" disabled={props.page >= totalPages()} onClick={() => props.onPageChange(props.page + 1)}>
            Next
          </button>
        </div>
      </div>

      <div class="flex flex-wrap gap-2 border-t border-stroke px-5 py-3">
        <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm font-medium hover:bg-slate-50" onClick={() => void downloadCsv()}>
          Excel
        </button>
      </div>
    </section>
  );
}
