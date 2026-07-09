import { For, Show } from "solid-js";
import { formatPeso } from "../../../shared/money";
import { useAuth } from "../../../shared/auth-context";
import { getAccessToken } from "../../../shared/api";
import { officialReceiptStatusExportUrl } from "../../../shared/useOfficialReceiptStatusReport";
import type { OfficialReceiptStatusRow } from "../../../shared/useOfficialReceiptStatusReport";
import { formatDisplayDate, type OfficialReceiptStatusFilters } from "./officialReceiptStatusFilters";
import { LoadingText } from "../../../shared/LoadingText";

type Props = {
  filters: OfficialReceiptStatusFilters;
  rows: OfficialReceiptStatusRow[];
  totalRows: number;
  page: number;
  pageSize: number;
  loading: boolean;
  generatedAt: () => Date;
  onPageChange: (page: number) => void;
  onOpenReceipt: (receiptId: number) => void;
};



export function OfficialReceiptStatusReport(props: Props) {
  const auth = useAuth();
  const companyName = () => auth.me?.tenant.company_name ?? "Company";
  const totalPages = () => Math.max(1, Math.ceil(props.totalRows / props.pageSize));

  const downloadCsv = async () => {
    const token = await getAccessToken();
    const res = await fetch(officialReceiptStatusExportUrl(props.filters), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "official-receipt-status.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section class="mt-6 rounded-xl border border-stroke bg-white p-5 shadow-sm">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-xl font-bold text-text-primary">Official Receipt Status</h2>
          <p class="text-sm text-text-secondary">
            {companyName()} · {formatDisplayDate(props.filters.date_from)} ~ {formatDisplayDate(props.filters.date_to)} · Generated{" "}
            {props.generatedAt().toLocaleString()}
          </p>
        </div>
        <button type="button" class="rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50" onClick={() => void downloadCsv()}>
          Export CSV
        </button>
      </div>
      <Show when={props.loading}>
        <LoadingText class="text-sm text-text-secondary" as="p" />
      </Show>
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="border-b border-stroke bg-slate-50 text-left text-text-secondary">
            <tr>
              <th class="px-3 py-2">Date-No.</th>
              <th class="px-3 py-2">Customer/Vendor Name</th>
              <th class="px-3 py-2 text-right">Amount</th>
              <th class="px-3 py-2">Remark</th>
            </tr>
          </thead>
          <tbody>
            <For each={props.rows}>
              {(row) => (
                <tr class="border-b border-stroke/60 hover:bg-slate-50/50">
                  <td class="px-3 py-2">
                    <button type="button" class="font-medium text-brand-600 hover:underline" onClick={() => props.onOpenReceipt(row.receipt_id)}>
                      {row.date_no_display}
                    </button>
                  </td>
                  <td class="px-3 py-2">{row.customer_name}</td>
                  <td class="px-3 py-2 text-right tabular-nums">{formatPeso(row.amount)}</td>
                  <td class="px-3 py-2 max-w-md truncate" title={row.remark}>{row.remark}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
      <div class="mt-4 flex items-center justify-between text-sm text-text-secondary">
        <span>{props.totalRows} row(s)</span>
        <div class="flex items-center gap-2">
          <button type="button" class="rounded border border-stroke px-2 py-1 disabled:opacity-40" disabled={props.page <= 1} onClick={() => props.onPageChange(props.page - 1)}>
            Prev
          </button>
          <span>
            Page {props.page} / {totalPages()}
          </span>
          <button type="button" class="rounded border border-stroke px-2 py-1 disabled:opacity-40" disabled={props.page >= totalPages()} onClick={() => props.onPageChange(props.page + 1)}>
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
