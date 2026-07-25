import { createSignal, For, onMount, Show } from "solid-js";
import { defaultReportDateRange, ReportPageLayout } from "../../../shared/reports/ReportPageLayout";
import { downloadReportCsv } from "../../../shared/reports/downloadReportCsv";
import { apiFetch } from "../../../shared/api";
import { createQuery } from "@tanstack/solid-query";
import { FinanceLayout } from "../FinanceLayout";
import type { DateRangeFilters } from "../../../shared/reports/useModuleReports";
import { MoneyCell } from "../../../shared/MoneyCell";

type CashBookRow = {
  entry_date: string;
  entry_no: string;
  account_code: string;
  account_name: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
};

type Props = { title?: string; apiPath?: string; exportName?: string };

export default function CashBookReportPage(props: Props) {
  const title = () => props.title ?? "Cash Book";
  const apiPath = () => props.apiPath ?? "/api/v1/finance/reports/cash-book";
  const defaults = defaultReportDateRange();
  const [submitted, setSubmitted] = createSignal(false);
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const [filters, setFilters] = createSignal<DateRangeFilters>(defaults);
  const pageSize = 50;

  const report = createQuery(() => ({
    queryKey: ["cash-book", apiPath(), filters(), page(), submitted()],
    enabled: submitted(),
    queryFn: async () => {
      const qs = new URLSearchParams({ page: String(page()), pageSize: String(pageSize), sort: "entry_date", order: "asc" });
      if (filters().date_from) qs.set("date_from", filters().date_from!);
      if (filters().date_to) qs.set("date_to", filters().date_to!);
      const res = await apiFetch<CashBookRow[]>(`${apiPath()}?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load cash book");
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

  const totalPages = () => Math.max(1, Math.ceil((report.data?.total ?? 0) / pageSize));

  const exportUrl = () => {
    const qs = new URLSearchParams();
    if (filters().date_from) qs.set("date_from", filters().date_from!);
    if (filters().date_to) qs.set("date_to", filters().date_to!);
    return `${apiPath()}/export?${qs}`;
  };

  return (
    <FinanceLayout>
      <ReportPageLayout
        title={title()}
        description="Cash and bank account movements from posted journals — Search (F8)."
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
        onSearch={search}
        onReset={() => {
          setFilters(defaults);
          setSubmitted(false);
          setPage(1);
        }}
        onExportCsv={() => void downloadReportCsv(exportUrl(), props.exportName ?? "cash-book.csv")}
      >
        <Show when={submitted() && (report.data?.rows.length ?? 0) === 0}>
          <p class="px-5 py-4 text-sm text-text-secondary">No cash/bank movements in this period.</p>
        </Show>
        <table class="erp-grid min-w-full text-left text-sm">
          <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
            <tr>
              <th class="px-3 py-2">Date</th>
              <th class="px-3 py-2">Entry</th>
              <th class="px-3 py-2">Account</th>
              <th class="px-3 py-2">Description</th>
              <th class="px-3 py-2 text-right">Debit</th>
              <th class="px-3 py-2 text-right">Credit</th>
              <th class="px-3 py-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            <For each={report.data?.rows ?? []}>
              {(row) => (
                <tr class="border-t border-stroke/60">
                  <td class="px-3 py-2">{row.entry_date}</td>
                  <td class="px-3 py-2">{row.entry_no}</td>
                  <td class="px-3 py-2">{row.account_code} — {row.account_name}</td>
                  <td class="px-3 py-2">{row.description}</td>
                  <MoneyCell value={row.debit} sign={false} />
                  <MoneyCell value={row.credit} sign={false} />
                  <MoneyCell value={row.balance} sign={false} />
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </ReportPageLayout>
    </FinanceLayout>
  );
}
