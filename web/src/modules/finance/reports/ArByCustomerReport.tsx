import { For, Show } from "solid-js";
import { formatPeso } from "../../../shared/money";
import { useAuth } from "../../../shared/auth-context";
import { getAccessToken } from "../../../shared/api";
import { arByCustomerExportUrl } from "../../../shared/useArByCustomerReport";
import type { ArByCustomerRow } from "../../../shared/useArByCustomerReport";
import { formatDisplayDate, type ArByCustomerFilters } from "./arByCustomerFilters";
import { ReportEmptyRow, ReportLoadingRow } from "../../../shared/reports/ReportTableStates";
import { GridExportButtons } from "../../../shared/gridExport";

type Props = {
  filters: ArByCustomerFilters;
  rows: ArByCustomerRow[];
  totalRows: number;
  page: number;
  pageSize: number;
  onPageSizeChange?: (pageSize: number) => void;
  loading: boolean;
  generatedAt: () => Date;
  onPageChange: (page: number) => void;
};



export function ArByCustomerReport(props: Props) {
  const auth = useAuth();
  const companyName = () => auth.me?.tenant.company_name ?? "Company";
  const totalPages = () => Math.max(1, Math.ceil(props.totalRows / props.pageSize));
  let reportBodyEl: HTMLDivElement | undefined;

  const downloadCsv = async () => {
    const token = await getAccessToken();
    const res = await fetch(arByCustomerExportUrl(props.filters), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ar-by-customer.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const dateRange = () => {
    const from = props.filters.date_from;
    const to = props.filters.date_to;
    if (from && to) return `${formatDisplayDate(from)} ~ ${formatDisplayDate(to)}`;
    return "All dates";
  };

  const totals = () =>
    props.rows.reduce(
      (acc, r) => ({
        inv: acc.inv + r.inv_sales,
        acct: acc.acct + r.acct_sales,
        sales: acc.sales + r.total_sales,
        received: acc.received + r.total_received,
        balance: acc.balance + r.balance,
      }),
      { inv: 0, acct: 0, sales: 0, received: 0, balance: 0 },
    );

  return (
    <section class="mt-6 rounded-xl border border-stroke bg-white shadow-sm">
      <div class="border-b border-stroke px-5 py-4 text-center">
        <div class="mb-3 flex justify-end">
          <GridExportButtons
            title="A/R by Customer"
            filename="ar-by-customer"
            columns={[]}
            rows={() => []}
            scrapeRoot={() => reportBodyEl}
          />
        </div>
        <h2 class="text-xl font-bold text-text-primary">A/R by Customer</h2>
        <div class="mt-2 flex flex-wrap justify-between gap-2 text-sm text-text-secondary">
          <span>Company Name : {companyName()}</span>
          <span>{dateRange()}</span>
        </div>
      </div>

      <div class="overflow-x-auto" ref={(el) => (reportBodyEl = el)}>
        <table class="erp-grid min-w-full text-left text-sm">
          <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
            <tr>
              <th class="px-3 py-2">Customer</th>
              <th class="px-3 py-2 text-right">Inv Sales</th>
              <th class="px-3 py-2 text-right">Acct Sales</th>
              <th class="px-3 py-2 text-right">Total Sales</th>
              <th class="px-3 py-2 text-right">Total Received</th>
              <th class="px-3 py-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            <Show when={props.loading}>
              <ReportLoadingRow colSpan={6} />
            </Show>
            <Show when={!props.loading && props.rows.length === 0}>
              <ReportEmptyRow colSpan={6} />
            </Show>
            <For each={props.rows}>
              {(row) => (
                <tr class="border-t border-stroke/60 hover:bg-slate-50/50">
                  <td class="px-3 py-2">{row.customer_name}</td>
                  <td class="px-3 py-2 text-right">{formatPeso(row.inv_sales)}</td>
                  <td class="px-3 py-2 text-right">{formatPeso(row.acct_sales)}</td>
                  <td class="px-3 py-2 text-right">{formatPeso(row.total_sales)}</td>
                  <td class="px-3 py-2 text-right">{formatPeso(row.total_received)}</td>
                  <td class="px-3 py-2 text-right font-medium">{formatPeso(row.balance)}</td>
                </tr>
              )}
            </For>
          </tbody>
          <Show when={!props.loading && props.rows.length > 0}>
            <tfoot class="border-t-2 border-stroke bg-slate-50 font-semibold">
              <tr>
                <td class="px-3 py-2">Page totals</td>
                <td class="px-3 py-2 text-right">{formatPeso(totals().inv)}</td>
                <td class="px-3 py-2 text-right">{formatPeso(totals().acct)}</td>
                <td class="px-3 py-2 text-right">{formatPeso(totals().sales)}</td>
                <td class="px-3 py-2 text-right">{formatPeso(totals().received)}</td>
                <td class="px-3 py-2 text-right">{formatPeso(totals().balance)}</td>
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
