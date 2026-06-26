import { For, Show } from "solid-js";
import { useAuth } from "../../../shared/auth-context";
import { getAccessToken } from "../../../shared/api";
import { discountStatusExportUrl, type SalesDiscountStatusRow } from "../../../shared/useSalesDiscountStatusReport";
import { formatDisplayDate, type SalesStatusFilters } from "../sales/salesStatusFilters";

type Props = {
  filters: SalesStatusFilters;
  rows: SalesDiscountStatusRow[];
  totalQty: number;
  totalDiscount: number;
  totalAmount: number;
  totalRows: number;
  page: number;
  pageSize: number;
  loading: boolean;
  generatedAt: () => Date;
  onPageChange: (page: number) => void;
};

function money(n: number) {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function SalesDiscountStatusReport(props: Props) {
  const auth = useAuth();
  const totalPages = () => Math.max(1, Math.ceil(props.totalRows / props.pageSize));

  const downloadCsv = async () => {
    const token = await getAccessToken();
    const res = await fetch(discountStatusExportUrl(props.filters), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sales-discount-status.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section class="mt-6 rounded-xl border border-stroke bg-white p-5 shadow-sm">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-xl font-bold text-text-primary">Sales Discount Status</h2>
          <p class="text-sm text-text-secondary">
            {auth.me?.tenant.company_name ?? "Company"} · {formatDisplayDate(props.filters.date_from)} ~ {formatDisplayDate(props.filters.date_to)}
          </p>
        </div>
        <button type="button" class="rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50" onClick={() => void downloadCsv()}>
          Export CSV
        </button>
      </div>
      <Show when={props.loading}><p class="text-sm text-text-secondary">Loading…</p></Show>
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="border-b border-stroke bg-slate-50 text-left text-text-secondary">
            <tr>
              <th class="px-3 py-2">Date-No.</th>
              <th class="px-3 py-2">Sales No.</th>
              <th class="px-3 py-2">Customer</th>
              <th class="px-3 py-2">Item</th>
              <th class="px-3 py-2 text-right">Qty</th>
              <th class="px-3 py-2 text-right">Discount</th>
              <th class="px-3 py-2 text-right">Line Total</th>
              <th class="px-3 py-2">Location</th>
              <th class="px-3 py-2">Department</th>
            </tr>
          </thead>
          <tbody>
            <For each={props.rows}>
              {(row) => (
                <tr class="border-b border-stroke/60">
                  <td class="px-3 py-2">{row.date_no_display}</td>
                  <td class="px-3 py-2">{row.sales_no}</td>
                  <td class="px-3 py-2">{row.customer_name}</td>
                  <td class="px-3 py-2">{row.item_code} — {row.item_name}</td>
                  <td class="px-3 py-2 text-right tabular-nums">{row.qty}</td>
                  <td class="px-3 py-2 text-right tabular-nums">{money(row.discount_amount)}</td>
                  <td class="px-3 py-2 text-right tabular-nums">{money(row.line_total)}</td>
                  <td class="px-3 py-2">{row.location_name}</td>
                  <td class="px-3 py-2">{row.department_name ?? ""}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
      <p class="mt-3 text-sm text-text-secondary">
        Totals — Qty: {props.totalQty.toLocaleString()} · Discount: {money(props.totalDiscount)} · Amount: {money(props.totalAmount)}
      </p>
      <div class="mt-4 flex items-center justify-between text-sm text-text-secondary">
        <span>{props.totalRows} row(s)</span>
        <div class="flex items-center gap-2">
          <button type="button" class="rounded border border-stroke px-2 py-1 disabled:opacity-40" disabled={props.page <= 1} onClick={() => props.onPageChange(props.page - 1)}>Prev</button>
          <span>Page {props.page} / {totalPages()}</span>
          <button type="button" class="rounded border border-stroke px-2 py-1 disabled:opacity-40" disabled={props.page >= totalPages()} onClick={() => props.onPageChange(props.page + 1)}>Next</button>
        </div>
      </div>
    </section>
  );
}
