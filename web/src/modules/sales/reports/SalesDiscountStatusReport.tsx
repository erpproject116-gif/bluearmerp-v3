import { For, Show } from "solid-js";
import { formatPeso } from "../../../shared/money";
import { useAuth } from "../../../shared/auth-context";
import { getAccessToken } from "../../../shared/api";
import { discountStatusExportUrl, type SalesDiscountStatusRow } from "../../../shared/useSalesDiscountStatusReport";
import { buildDiscountReportLines } from "./discountStatusGrouping";
import { DiscountReportTableRow } from "./DiscountReportTableRow";
import { SalesDiscountStatusGraph } from "./SalesDiscountStatusGraph";
import {
  DISCOUNT_STATUS_COLUMNS,
  showDiscountColumn,
  type DiscountColumnKey,
} from "./discountStatusColumns";
import { formatDisplayDate, filtersToSearchParams, type SalesDiscountStatusFilters } from "./salesDiscountStatusFilters";
import { templateToSearchParams, type DiscountSortField, type SalesDiscountStatusTemplate } from "./salesDiscountStatusTemplate";
import { LoadingText } from "../../../shared/LoadingText";

type Props = {
  filters: SalesDiscountStatusFilters;
  template: SalesDiscountStatusTemplate;
  rows: SalesDiscountStatusRow[];
  totalSales: number;
  totalInvoicing: number;
  totalDifference: number;
  totalRows: number;
  page: number;
  pageSize: number;
  onPageSizeChange?: (pageSize: number) => void;
  loading: boolean;
  generatedAt: () => Date;
  subtotalMode: boolean;
  onPageChange: (page: number) => void;
  onSort: (field: DiscountSortField) => void;
};



function sortIndicator(active: boolean, order: "asc" | "desc") {
  if (!active) return "";
  return order === "asc" ? " ↑" : " ↓";
}

export function SalesDiscountStatusReport(props: Props) {
  const auth = useAuth();
  const totalPages = () => Math.max(1, Math.ceil(props.totalRows / props.pageSize));
  const reportLines = () => buildDiscountReportLines(props.rows, props.template.subtotalBy);
  const showCol = (key: DiscountColumnKey) =>
    showDiscountColumn(key, props.template.columnVisibility, props.template.displayApvlLine);

  const downloadCsv = async () => {
    const token = await getAccessToken();
    const res = await fetch(discountStatusExportUrl(props.filters, props.template), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sales-discount-status.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const openPrint = () => {
    const qs = new URLSearchParams(filtersToSearchParams(props.filters).toString());
    for (const [k, v] of templateToSearchParams(props.template)) qs.set(k, v);
    window.open(`/app/sales/reports/discount-status/print?${qs}`, "_blank", "noopener,noreferrer");
  };

  const sortableTh = (field: DiscountSortField, label: string, align: "left" | "right" = "left") => (
    <th class={`px-3 py-2 ${align === "right" ? "text-right" : "text-left"}`}>
      <button type="button" class="font-inherit hover:text-brand-600" onClick={() => props.onSort(field)}>
        {label}{sortIndicator(props.template.sortField === field, props.template.sortOrder)}
      </button>
    </th>
  );

  const labelColspan = () => [showCol("order_date"), showCol("customer_name")].filter(Boolean).length || 1;

  return (
    <section class="mt-6 rounded-xl border border-stroke bg-white p-5 shadow-sm">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-xl font-bold text-text-primary">Sales Discount Status</h2>
          <p class="text-sm text-text-secondary">
            {auth.me?.tenant.company_name ?? "Company"} · {formatDisplayDate(props.filters.date_from)} ~ {formatDisplayDate(props.filters.date_to)}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50" onClick={() => void downloadCsv()}>
            Export CSV
          </button>
          <button type="button" class="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700" onClick={openPrint}>
            Print / PDF
          </button>
        </div>
      </div>
      <Show when={props.loading}><LoadingText class="text-sm text-text-secondary" as="p" /></Show>
      <Show when={props.subtotalMode && props.totalRows > props.pageSize}>
        <p class="mb-2 text-xs text-amber-700">
          Subtotal mode loaded {Math.min(props.rows.length, props.pageSize)} of {props.totalRows} row(s). Narrow filters if you need all groups.
        </p>
      </Show>
      <Show when={props.template.viewAsGraph}>
        <SalesDiscountStatusGraph rows={props.rows} metric="difference_amount" />
      </Show>
      <Show when={!props.template.viewAsGraph}>
        <div class="overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead class="border-b border-stroke bg-slate-50 text-left text-text-secondary">
              <tr>
                <For each={DISCOUNT_STATUS_COLUMNS}>
                  {(col) => (
                    <Show when={showCol(col.key as DiscountColumnKey)}>
                      {col.key === "order_date" && sortableTh("order_date", col.label)}
                      {col.key === "customer_name" && sortableTh("customer_name", col.label)}
                      {col.key === "sales_amount" && sortableTh("sales_amount", col.label, "right")}
                      {col.key === "invoicing_amount" && sortableTh("invoicing_amount", col.label, "right")}
                      {col.key === "difference_amount" && sortableTh("difference_amount", col.label, "right")}
                      {(col.key === "apvl_line" || col.key === "remark") && (
                        <th class="px-3 py-2">{col.label}</th>
                      )}
                    </Show>
                  )}
                </For>
              </tr>
            </thead>
            <tbody>
              <For each={reportLines()}>
                {(line) => (
                  <DiscountReportTableRow
                    line={line}
                    displayApvlLine={props.template.displayApvlLine}
                    columnVisibility={props.template.columnVisibility}
                    money={formatPeso}
                  />
                )}
              </For>
            </tbody>
            <tfoot class="border-t-2 border-stroke bg-slate-50 font-semibold">
              <tr>
                <Show when={showCol("order_date") || showCol("customer_name")}>
                  <td class="px-3 py-2" colSpan={labelColspan()}>Total</td>
                </Show>
                <Show when={showCol("sales_amount")}><td class="px-3 py-2 text-right tabular-nums">{formatPeso(props.totalSales)}</td></Show>
                <Show when={showCol("invoicing_amount")}><td class="px-3 py-2 text-right tabular-nums">{formatPeso(props.totalInvoicing)}</td></Show>
                <Show when={showCol("difference_amount")}><td class="px-3 py-2 text-right tabular-nums">{formatPeso(props.totalDifference)}</td></Show>
                <Show when={showCol("apvl_line")}><td class="px-3 py-2" /></Show>
                <Show when={showCol("remark")}><td class="px-3 py-2" /></Show>
              </tr>
            </tfoot>
          </table>
        </div>
      </Show>
      <Show when={!props.template.viewAsGraph && !props.subtotalMode}>
        <div class="mt-4 flex items-center justify-between text-sm text-text-secondary">
          <span>{props.totalRows} row(s)</span>
          <div class="flex items-center gap-2">
            <button type="button" class="rounded border border-stroke px-2 py-1 disabled:opacity-40" disabled={props.page <= 1} onClick={() => props.onPageChange(props.page - 1)}>Prev</button>
            <span>Page {props.page} / {totalPages()}</span>
            <button type="button" class="rounded border border-stroke px-2 py-1 disabled:opacity-40" disabled={props.page >= totalPages()} onClick={() => props.onPageChange(props.page + 1)}>Next</button>
          </div>
        </div>
      </Show>
      <Show when={!props.template.viewAsGraph && props.subtotalMode}>
        <p class="mt-4 text-sm text-text-secondary">{props.totalRows} row(s) · subtotal view</p>
      </Show>
    </section>
  );
}
