import { For, Show } from "solid-js";
import { useAuth } from "../../../shared/auth-context";
import { getAccessToken } from "../../../shared/api";
import {
  collectiveInvoiceStatusExportUrl,
  type CollectiveInvoiceStatusRow,
} from "../../../shared/useCollectiveInvoiceStatusReport";
import { buildInvoiceReportLines, type InvoiceReportLine } from "./invoiceStatusGrouping";
import { CollectiveInvoiceTransactionsModal } from "./CollectiveInvoiceTransactionsModal";
import { formatDisplayDate, filtersToSearchParams, type CollectiveInvoiceStatusFilters } from "./collectiveInvoiceStatusFilters";
import { templateToSearchParams, type CollectiveInvoiceStatusTemplate, type InvoiceSortField } from "./collectiveInvoiceStatusTemplate";
import { createSignal } from "solid-js";

type Props = {
  filters: CollectiveInvoiceStatusFilters;
  template: CollectiveInvoiceStatusTemplate;
  rows: CollectiveInvoiceStatusRow[];
  totalPretax: number;
  totalTax: number;
  totalSales: number;
  totalRows: number;
  page: number;
  pageSize: number;
  loading: boolean;
  generatedAt: () => Date;
  subtotalMode: boolean;
  onPageChange: (page: number) => void;
  onSort: (field: InvoiceSortField) => void;
};

function money(n: number) {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function sortIndicator(active: boolean, order: "asc" | "desc") {
  if (!active) return "";
  return order === "asc" ? " ↑" : " ↓";
}

function openSlipPrint(id: number) {
  window.open(`/app/sales/collective-invoicing/${id}/slip/print`, "_blank", "noopener,noreferrer");
}

function ReportRow(props: { line: InvoiceReportLine; onViewTrans: (id: number) => void }) {
  if (props.line.kind === "group") {
    return (
      <tr class="bg-slate-100 font-semibold">
        <td class="px-3 py-2" colSpan={9}>{props.line.label}</td>
      </tr>
    );
  }
  if (props.line.kind === "subtotal") {
    return (
      <tr class="bg-slate-50 font-semibold">
        <td class="px-3 py-2" colSpan={3}>{props.line.label}</td>
        <td class="px-3 py-2 text-right tabular-nums">{money(props.line.pretax_amount)}</td>
        <td class="px-3 py-2 text-right tabular-nums">{money(props.line.sales_tax)}</td>
        <td class="px-3 py-2 text-right tabular-nums">{money(props.line.total_sales)}</td>
        <td class="px-3 py-2" colSpan={3} />
      </tr>
    );
  }
  const row = props.line.row;
  return (
    <tr class="border-b border-stroke/60">
      <td class="px-3 py-2">{row.date_no_display}</td>
      <td class="px-3 py-2">{row.receivable_no}</td>
      <td class="px-3 py-2">{row.customer_name}</td>
      <td class="px-3 py-2 text-right tabular-nums">{money(row.pretax_amount)}</td>
      <td class="px-3 py-2 text-right tabular-nums">{money(row.sales_tax)}</td>
      <td class="px-3 py-2 text-right tabular-nums">{money(row.total_sales)}</td>
      <td class="px-3 py-2">{row.due_date ?? ""}</td>
      <td class="px-3 py-2">
        <button type="button" class="text-brand-600 hover:underline" onClick={() => props.onViewTrans(row.id)}>
          View Trans.
        </button>
        {" · "}
        <button type="button" class="text-brand-600 hover:underline" onClick={() => openSlipPrint(row.id)}>
          Sales Slip
        </button>
      </td>
      <td class="px-3 py-2 text-xs text-text-secondary">{row.status}</td>
    </tr>
  );
}

export function CollectiveInvoiceStatusReport(props: Props) {
  const auth = useAuth();
  const [transInvoiceId, setTransInvoiceId] = createSignal<number | null>(null);
  const totalPages = () => Math.max(1, Math.ceil(props.totalRows / props.pageSize));
  const reportLines = () => buildInvoiceReportLines(props.rows, props.template.subtotalBy);

  const downloadCsv = async () => {
    const token = await getAccessToken();
    const res = await fetch(collectiveInvoiceStatusExportUrl(props.filters, props.template), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sales-invoice-status.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const openPrint = () => {
    const qs = new URLSearchParams(filtersToSearchParams(props.filters));
    for (const [k, v] of templateToSearchParams(props.template)) qs.set(k, v);
    window.open(`/app/sales/collective-invoicing/status/print?${qs}`, "_blank", "noopener,noreferrer");
  };

  const sortableTh = (field: InvoiceSortField, label: string, align: "left" | "right" = "left") => (
    <th class={`px-3 py-2 ${align === "right" ? "text-right" : "text-left"}`}>
      <button type="button" class="font-inherit hover:text-brand-600" onClick={() => props.onSort(field)}>
        {label}{sortIndicator(props.template.sortField === field, props.template.sortOrder)}
      </button>
    </th>
  );

  return (
    <section class="mt-6 rounded-xl border border-stroke bg-white p-5 shadow-sm">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-xl font-bold text-text-primary">Sales Invoice Status</h2>
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
      <Show when={props.loading}><p class="text-sm text-text-secondary">Loading…</p></Show>
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="border-b border-stroke bg-slate-50 text-left text-text-secondary">
            <tr>
              {sortableTh("invoice_date", "Date-No.")}
              {sortableTh("receivable_no", "Receivable No.")}
              {sortableTh("customer_name", "Customer/Vendor Name")}
              <th class="px-3 py-2 text-right">Pretax Amount</th>
              <th class="px-3 py-2 text-right">Sales Tax</th>
              {sortableTh("grand_total", "Total Sales", "right")}
              <th class="px-3 py-2">Due Date</th>
              <th class="px-3 py-2">View Trans. / Sales Slip</th>
              <th class="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            <For each={reportLines()}>
              {(line) => <ReportRow line={line} onViewTrans={setTransInvoiceId} />}
            </For>
          </tbody>
          <tfoot class="border-t-2 border-stroke bg-slate-50 font-semibold">
            <tr>
              <td class="px-3 py-2" colSpan={3}>Total</td>
              <td class="px-3 py-2 text-right tabular-nums">{money(props.totalPretax)}</td>
              <td class="px-3 py-2 text-right tabular-nums">{money(props.totalTax)}</td>
              <td class="px-3 py-2 text-right tabular-nums">{money(props.totalSales)}</td>
              <td class="px-3 py-2" colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>
      <Show when={!props.subtotalMode}>
        <div class="mt-4 flex items-center justify-between text-sm text-text-secondary">
          <span>{props.totalRows} row(s)</span>
          <div class="flex items-center gap-2">
            <button type="button" class="rounded border border-stroke px-2 py-1 disabled:opacity-40" disabled={props.page <= 1} onClick={() => props.onPageChange(props.page - 1)}>Prev</button>
            <span>Page {props.page} / {totalPages()}</span>
            <button type="button" class="rounded border border-stroke px-2 py-1 disabled:opacity-40" disabled={props.page >= totalPages()} onClick={() => props.onPageChange(props.page + 1)}>Next</button>
          </div>
        </div>
      </Show>
      <CollectiveInvoiceTransactionsModal invoiceId={transInvoiceId()} onClose={() => setTransInvoiceId(null)} />
    </section>
  );
}
