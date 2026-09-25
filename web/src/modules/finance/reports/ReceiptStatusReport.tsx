import { For, Show } from "solid-js";
import { formatPeso } from "../../../shared/money";
import { useAuth } from "../../../shared/auth-context";
import { getAccessToken } from "../../../shared/api";
import { receiptStatusExportUrl } from "../../../shared/useReceiptStatusReport";
import type { ReceiptStatusReportRow } from "../../../shared/useReceiptStatusReport";
import { formatDisplayDate, receiptStatusLabel, type ReceiptStatusFilters } from "./receiptStatusFilters";
import { ReportEmptyRow, ReportLoadingRow } from "../../../shared/reports/ReportTableStates";

type Props = {
  filters: ReceiptStatusFilters;
  rows: ReceiptStatusReportRow[];
  totalQty: number;
  totalAmount: number;
  totalRows: number;
  page: number;
  pageSize: number;
  onPageSizeChange?: (pageSize: number) => void;
  loading: boolean;
  generatedAt: () => Date;
  onPageChange: (page: number) => void;
};



export function ReceiptStatusReport(props: Props) {
  const auth = useAuth();
  const companyName = () => auth.me?.tenant.company_name ?? "Company";
  const totalPages = () => Math.max(1, Math.ceil(props.totalRows / props.pageSize));

  const downloadCsv = async () => {
    const token = await getAccessToken();
    const res = await fetch(receiptStatusExportUrl(props.filters), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "receipt-status.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const dateRange = () => {
    const from = props.filters.date_from;
    const to = props.filters.date_to;
    if (from && to) return `${formatDisplayDate(from)} ~ ${formatDisplayDate(to)}`;
    return "All dates";
  };

  return (
    <section class="mt-6 rounded-xl border border-stroke bg-white shadow-sm">
      <div class="border-b border-stroke px-5 py-4 text-center">
        <h2 class="text-xl font-bold text-text-primary">SI Receipt Status</h2>
        <div class="mt-2 flex flex-wrap justify-between gap-2 text-sm text-text-secondary">
          <span>Company Name : {companyName()}</span>
          <span>{dateRange()}</span>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="erp-grid min-w-full text-left text-sm">
          <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
            <tr>
              <th class="px-3 py-2">Date-No.</th>
              <th class="px-3 py-2">Sales No.</th>
              <th class="px-3 py-2">Customer</th>
              <th class="px-3 py-2 text-right">Grand Total</th>
              <th class="px-3 py-2 text-right">Received</th>
              <th class="px-3 py-2 text-right">Balance</th>
              <th class="px-3 py-2">Receipt Status</th>
              <th class="px-3 py-2">Item Code</th>
              <th class="px-3 py-2">Item Name</th>
              <th class="px-3 py-2 text-right">Qty</th>
              <th class="px-3 py-2 text-right">Line Total</th>
            </tr>
          </thead>
          <tbody>
            <Show when={props.loading}>
              <ReportLoadingRow colSpan={11} />
            </Show>
            <Show when={!props.loading && props.rows.length === 0}>
              <ReportEmptyRow colSpan={11} />
            </Show>
            <For each={props.rows}>
              {(row) => (
                <tr class="border-t border-stroke/60 hover:bg-slate-50/50">
                  <td class="px-3 py-2">{row.date_no_display}</td>
                  <td class="px-3 py-2">{row.sales_no}</td>
                  <td class="px-3 py-2">{row.customer_name}</td>
                  <td class="px-3 py-2 text-right">{formatPeso(row.grand_total)}</td>
                  <td class="px-3 py-2 text-right">{formatPeso(row.received_amount)}</td>
                  <td class="px-3 py-2 text-right">{formatPeso(row.balance)}</td>
                  <td class="px-3 py-2">{receiptStatusLabel(row.receipt_status)}</td>
                  <td class="px-3 py-2">{row.item_code}</td>
                  <td class="px-3 py-2">{row.item_name}</td>
                  <td class="px-3 py-2 text-right">{formatPeso(row.qty)}</td>
                  <td class="px-3 py-2 text-right">{formatPeso(row.line_total)}</td>
                </tr>
              )}
            </For>
          </tbody>
          <Show when={!props.loading && props.rows.length > 0}>
            <tfoot class="border-t-2 border-stroke bg-slate-50 font-semibold">
              <tr>
                <td class="px-3 py-2" colSpan={9}>
                  Totals
                </td>
                <td class="px-3 py-2 text-right">{formatPeso(props.totalQty)}</td>
                <td class="px-3 py-2 text-right">{formatPeso(props.totalAmount)}</td>
              </tr>
            </tfoot>
          </Show>
        </table>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3 border-t border-stroke px-5 py-3 text-sm">
        <span class="text-text-secondary">
          Generated {props.generatedAt().toLocaleString()} · {props.totalRows} row(s)
        </span>
        <div class="flex items-center gap-2">
          <button type="button" class="rounded border border-stroke px-3 py-1 hover:bg-slate-50" onClick={() => void downloadCsv()}>
            Export CSV
          </button>
          <button
            type="button"
            class="rounded border border-stroke px-3 py-1 hover:bg-slate-50 disabled:opacity-50"
            disabled={props.page <= 1}
            onClick={() => props.onPageChange(props.page - 1)}
          >
            Prev
          </button>
          <span>
            Page {props.page} / {totalPages()}
          </span>
          <button
            type="button"
            class="rounded border border-stroke px-3 py-1 hover:bg-slate-50 disabled:opacity-50"
            disabled={props.page >= totalPages()}
            onClick={() => props.onPageChange(props.page + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
