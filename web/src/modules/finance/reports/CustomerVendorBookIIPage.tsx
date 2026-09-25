import { createSignal, For, onMount, Show } from "solid-js";
import { defaultReportDateRange, ReportPageLayout } from "../../../shared/reports/ReportPageLayout";
import { downloadReportCsv } from "../../../shared/reports/downloadReportCsv";
import { apiFetch } from "../../../shared/api";
import { createQuery } from "@tanstack/solid-query";
import { FinanceLayout } from "../FinanceLayout";
import type { DateRangeFilters } from "../../../shared/reports/useModuleReports";
import { formatAmount } from "../../../shared/money";

type BookIIRow = {
  partner_id: number;
  partner_name: string;
  opening: number;
  debit: number;
  credit: number;
  closing: number;
};

type Props = { bookType: "ar" | "ap" };

export default function CustomerVendorBookIIPage(props: Props) {
  const defaults = defaultReportDateRange();
  const [submitted, setSubmitted] = createSignal(true);
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const [filters, setFilters] = createSignal<DateRangeFilters>(defaults);
  const [pageSize, setPageSize] = createSignal(50);
  const title = () =>
    props.bookType === "ar" ? "Customer/Vendor Book II (AR)" : "Customer/Vendor Book II (AP)";

  const report = createQuery(() => ({
    queryKey: ["partner-book-ii", props.bookType, filters(), page(), submitted()],
    enabled: submitted(),
    queryFn: async () => {
      const qs = new URLSearchParams({
        book_type: props.bookType,
        page: String(page()),
        pageSize: String(pageSize()),
        sort: "partner_name",
        order: "asc",
      });
      if (filters().date_from) qs.set("date_from", filters().date_from!);
      if (filters().date_to) qs.set("date_to", filters().date_to!);
      const res = await apiFetch<BookIIRow[]>(`/api/v1/finance/reports/customer-vendor-book-ii?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load book II");
      return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
    },
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
    setSubmitted(true);
    setPage(1);
    setGeneratedAt(new Date());
  };

  const totalPages = () => Math.max(1, Math.ceil((report.data?.total ?? 0) / pageSize()));

  return (
    <FinanceLayout>
      <ReportPageLayout
        title={title()}
        description="Summary opening / period / closing balances by customer or vendor — Search (F8)."
        dateFrom={() => filters().date_from ?? ""}
        dateTo={() => filters().date_to ?? ""}
        onDateFromChange={(v) => setFilters((f) => ({ ...f, date_from: v }))}
        onDateToChange={(v) => setFilters((f) => ({ ...f, date_to: v }))}
        submitted={submitted()}
        loading={report.isFetching}
        generatedAt={generatedAt()}
        page={page()}
        totalPages={totalPages()}
        onPageChange={setPage}
      pageSize={pageSize()} onPageSizeChange={setPageSize}
        onSearch={search}
        onReset={() => {
          setFilters(defaults);
          setSubmitted(true);
          setPage(1);
        }}
        onExportCsv={() =>
          void downloadReportCsv(
            `/api/v1/finance/reports/customer-vendor-book-ii/export?book_type=${props.bookType}`,
            `customer-vendor-book-ii-${props.bookType}.csv`,
          )
        }
      >
        <Show when={submitted() && (report.data?.rows.length ?? 0) === 0}>
          <p class="px-5 py-4 text-sm text-text-secondary">No partner balances in this period.</p>
        </Show>
        <table class="erp-grid min-w-full text-left text-sm">
          <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
            <tr>
              <th class="px-3 py-2">Partner</th>
              <th class="px-3 py-2 text-right">Opening</th>
              <th class="px-3 py-2 text-right">Debit</th>
              <th class="px-3 py-2 text-right">Credit</th>
              <th class="px-3 py-2 text-right">Closing</th>
            </tr>
          </thead>
          <tbody>
            <For each={report.data?.rows ?? []}>
              {(row) => (
                <tr class="border-t border-stroke/60">
                  <td class="px-3 py-2">{row.partner_name}</td>
                  <td class="px-3 py-2 text-right">{formatAmount(row.opening)}</td>
                  <td class="px-3 py-2 text-right">{formatAmount(row.debit)}</td>
                  <td class="px-3 py-2 text-right">{formatAmount(row.credit)}</td>
                  <td class="px-3 py-2 text-right font-medium">{formatAmount(row.closing)}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </ReportPageLayout>
    </FinanceLayout>
  );
}
