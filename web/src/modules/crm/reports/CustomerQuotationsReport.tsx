import { For, Show } from "solid-js";
import { useAuth } from "../../../shared/auth-context";
import { getAccessToken } from "../../../shared/api";
import {
  customerQuotationsExportUrl,
  type CustomerQuotationsRow,
} from "../../../shared/useCrmReports";
import { formatDisplayDate, type CustomerQuotationsFilters } from "./customerQuotationsFilters";

type Props = {
  filters: CustomerQuotationsFilters;
  rows: CustomerQuotationsRow[];
  totalRows: number;
  page: number;
  pageSize: number;
  loading: boolean;
  generatedAt: () => Date;
  onPageChange: (page: number) => void;
};

export function CustomerQuotationsReport(props: Props) {
  const auth = useAuth();
  const companyName = () => auth.me?.tenant.company_name ?? "Company";
  const totalPages = () => Math.max(1, Math.ceil(props.totalRows / props.pageSize));

  const downloadCsv = async () => {
    const token = await getAccessToken();
    const res = await fetch(customerQuotationsExportUrl(props.filters), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "customer-quotations-by-item.csv";
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
        <h2 class="text-xl font-bold text-text-primary">Customer quotations by item</h2>
        <div class="mt-2 flex flex-wrap justify-between gap-2 text-sm text-text-secondary">
          <span>Company: {companyName()}</span>
          <span>{dateRange()}</span>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="erp-grid min-w-full text-left text-sm">
          <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
            <tr>
              <th class="px-3 py-2">Customer</th>
              <th class="px-3 py-2">Item</th>
              <th class="px-3 py-2 text-right">Quote count</th>
              <th class="px-3 py-2 text-right">Total qty</th>
            </tr>
          </thead>
          <tbody>
            <Show when={props.loading}>
              <tr>
                <td colSpan={4} class="px-3 py-8 text-center text-text-secondary">
                  Loading…
                </td>
              </tr>
            </Show>
            <Show when={!props.loading && props.rows.length === 0}>
              <tr>
                <td colSpan={4} class="px-3 py-8 text-center text-text-secondary">
                  No rows match your filters.
                </td>
              </tr>
            </Show>
            <For each={props.rows}>
              {(row) => (
                <tr class="border-t border-stroke/60 hover:bg-slate-50/50">
                  <td class="px-3 py-2">{row.customer_name}</td>
                  <td class="px-3 py-2">
                    {row.item_code} — {row.item_name}
                  </td>
                  <td class="px-3 py-2 text-right">{row.quotation_count}</td>
                  <td class="px-3 py-2 text-right">{row.total_qty}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3 border-t border-stroke px-5 py-3 text-sm">
        <span class="text-text-secondary">
          Generated {props.generatedAt().toLocaleString()} · {props.totalRows} row(s)
        </span>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="rounded border border-stroke px-3 py-1 hover:bg-slate-50"
            onClick={() => void downloadCsv()}
          >
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
