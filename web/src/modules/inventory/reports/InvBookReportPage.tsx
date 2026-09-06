import { createSignal, For, onMount, Show } from "solid-js";
import { A } from "@solidjs/router";
import { ReportPageLayout, defaultReportDateRange } from "../../../shared/reports/ReportPageLayout";
import { downloadReportCsv } from "../../../shared/reports/downloadReportCsv";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { invBookExportUrl, useInvBookReport, type InvBookFilters } from "../../../shared/reports/useModuleReports";
import { formatPeso } from "../../../shared/money";

function stockLedgerHref(row: { item_id: number; location_id: number }, filters: InvBookFilters): string {
  const qs = new URLSearchParams();
  qs.set("item_id", String(row.item_id));
  qs.set("location_id", String(row.location_id));
  if (filters.date_from) qs.set("date_from", filters.date_from);
  if (filters.date_to) qs.set("date_to", filters.date_to);
  return `/app/inventory/reports/stock-ledger?${qs.toString()}`;
}

export default function InvBookReportPage() {
  const defaults = defaultReportDateRange();
  const [filters, setFilters] = createSignal<InvBookFilters>(defaults);
  const [submitted, setSubmitted] = createSignal(true);
  const [page, setPage] = createSignal(1);
  const pageSize = 50;

  const report = useInvBookReport(() => ({
    filters: filters(),
    page: page(),
    pageSize,
    sort: "item_code",
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
    search();
    return () => window.removeEventListener("keydown", onKey);
  });

  const search = () => {
    setSubmitted(true);
    setPage(1);
  };

  const patch = (p: Partial<InvBookFilters>) => setFilters((prev) => ({ ...prev, ...p }));

  const totalPages = () => Math.max(1, Math.ceil((report.data?.total ?? 0) / pageSize));

  return (
    <ReportPageLayout
      title="Inv. Book"
      description="Opening, receipt, issue, and closing qty by item and location — click Closing to open Stock Ledger."
      dateFrom={() => filters().date_from ?? ""}
      dateTo={() => filters().date_to ?? ""}
      onDateFromChange={(v) => patch({ date_from: v })}
      onDateToChange={(v) => patch({ date_to: v })}
      submitted={submitted()}
      loading={report.isFetching}
      page={page()}
      totalPages={totalPages()}
      onPageChange={setPage}
      onSearch={search}
      onReset={() => {
        setFilters(defaults);
        setSubmitted(true);
        setPage(1);
      }}
      onExportCsv={() => void downloadReportCsv(invBookExportUrl(filters()), "inv-book.csv")}
      filterExtra={
        <div class="mt-4 grid gap-4 md:grid-cols-3">
          <Field label="Item keyword">
            <input class={inputClass} value={filters().q ?? ""} onInput={(e) => patch({ q: e.currentTarget.value })} />
          </Field>
          <Field label="Item ID">
            <input
              type="number"
              class={inputClass}
              value={filters().item_id ?? ""}
              onInput={(e) => patch({ item_id: e.currentTarget.value ? Number(e.currentTarget.value) : undefined })}
            />
          </Field>
          <Field label="Location ID">
            <input
              type="number"
              class={inputClass}
              value={filters().location_id ?? ""}
              onInput={(e) => patch({ location_id: e.currentTarget.value ? Number(e.currentTarget.value) : undefined })}
            />
          </Field>
        </div>
      }
    >
      <table class="erp-grid min-w-full text-left text-sm">
        <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
          <tr>
            <th class="px-3 py-2">Item</th>
            <th class="px-3 py-2">Location</th>
            <th class="px-3 py-2 text-right">Opening</th>
            <th class="px-3 py-2 text-right">Receipt</th>
            <th class="px-3 py-2 text-right">Issue</th>
            <th class="px-3 py-2 text-right">Closing</th>
            <th class="px-3 py-2 text-right">Purchase Price</th>
            <th class="px-3 py-2 text-right">Sales Price</th>
            <th class="px-3 py-2 text-right">VIP Price</th>
          </tr>
        </thead>
        <tbody>
          <For each={report.data?.rows ?? []}>
            {(row) => (
              <tr class="border-t border-stroke/60">
                <td class="px-3 py-2">{row.item_code} — {row.item_name}</td>
                <td class="px-3 py-2">{row.location_name}</td>
                <td class="px-3 py-2 text-right">{row.opening_qty}</td>
                <td class="px-3 py-2 text-right">{row.receipt_qty}</td>
                <td class="px-3 py-2 text-right">{row.issue_qty}</td>
                <td class="px-3 py-2 text-right">
                  <A
                    class="font-medium text-brand-600 hover:underline"
                    href={stockLedgerHref(row, filters())}
                    aria-label={`Open stock ledger for ${row.item_code} at ${row.location_name}`}
                  >
                    {row.closing_qty}
                  </A>
                </td>
                <td class="px-3 py-2 text-right">{formatPeso(row.purchase_price)}</td>
                <td class="px-3 py-2 text-right">{formatPeso(row.sales_price)}</td>
                <td class="px-3 py-2 text-right">{formatPeso(row.vip_price)}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <Show when={submitted() && (report.data?.rows?.length ?? 0) === 0 && !report.isFetching}>
        <p class="px-5 py-8 text-center text-sm text-text-secondary">
          No inventory book rows for this period. Try a wider date range, or post stock movements via{" "}
          <a class="text-brand-600 hover:underline" href="/app/inventory/stock-entries">
            Stock Entries
          </a>
          .
        </p>
      </Show>
      <Show when={report.isError}>
        <p class="px-5 py-4 text-center text-sm text-red-600">
          {(report.error as Error)?.message ?? "Failed to load inv. book."}
        </p>
      </Show>
    </ReportPageLayout>
  );
}
