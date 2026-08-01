import { createSignal, For, onMount, Show } from "solid-js";
import { defaultReportDateRange, ReportPageLayout } from "../../../shared/reports/ReportPageLayout";
import { downloadReportCsv } from "../../../shared/reports/downloadReportCsv";
import { apiFetch } from "../../../shared/api";
import { createQuery } from "@tanstack/solid-query";
import { FinanceLayout } from "../FinanceLayout";
import type { DateRangeFilters } from "../../../shared/reports/useModuleReports";
import { formatAmount } from "../../../shared/money";

type CashFlowPayload = {
  rows: { section: string; account_code: string; account_name: string; amount: number }[];
  operating_total: number;
  investing_total: number;
  financing_total: number;
  net_change: number;
  has_journal_data: boolean;
};

export default function CashFlowStatementPage() {
  const defaults = defaultReportDateRange();
  const [submitted, setSubmitted] = createSignal(true);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const [filters, setFilters] = createSignal<DateRangeFilters>(defaults);

  const report = createQuery(() => ({
    queryKey: ["cash-flow-statement", filters(), submitted()],
    enabled: submitted(),
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (filters().date_from) qs.set("date_from", filters().date_from!);
      if (filters().date_to) qs.set("date_to", filters().date_to!);
      const res = await apiFetch<CashFlowPayload>(`/api/v1/finance/reports/cash-flow-statement?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load cash flow");
      return res.data!;
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
    setGeneratedAt(new Date());
  };

  const exportUrl = () => {
    const qs = new URLSearchParams();
    if (filters().date_from) qs.set("date_from", filters().date_from!);
    if (filters().date_to) qs.set("date_to", filters().date_to!);
    return `/api/v1/finance/reports/cash-flow-statement/export?${qs}`;
  };

  return (
    <FinanceLayout>
      <ReportPageLayout
        title="Statement of Cash Flows"
        description="Cash movements classified into operating, investing, and financing — Search (F8)."
        dateFrom={() => filters().date_from ?? ""}
        dateTo={() => filters().date_to ?? ""}
        onDateFromChange={(v) => setFilters((f) => ({ ...f, date_from: v }))}
        onDateToChange={(v) => setFilters((f) => ({ ...f, date_to: v }))}
        submitted={submitted()}
        loading={report.isFetching}
        generatedAt={generatedAt()}
        page={1}
        totalPages={1}
        onPageChange={() => undefined}
        onSearch={search}
        onReset={() => {
          setFilters(defaults);
          setSubmitted(true);
        }}
        onExportCsv={() => void downloadReportCsv(exportUrl(), "cash-flow-statement.csv")}
      >
        <Show when={submitted() && report.data}>
          <div class="grid gap-2 px-5 py-3 text-sm sm:grid-cols-4">
            <span>Operating: {formatAmount(report.data!.operating_total)}</span>
            <span>Investing: {formatAmount(report.data!.investing_total)}</span>
            <span>Financing: {formatAmount(report.data!.financing_total)}</span>
            <span class="font-semibold">Net change: {formatAmount(report.data!.net_change)}</span>
          </div>
        </Show>
        <table class="erp-grid min-w-full text-left text-sm">
          <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
            <tr>
              <th class="px-3 py-2">Section</th>
              <th class="px-3 py-2">Account</th>
              <th class="px-3 py-2">Name</th>
              <th class="px-3 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <For each={report.data?.rows ?? []}>
              {(row) => (
                <tr class="border-t border-stroke/60">
                  <td class="px-3 py-2 capitalize">{row.section}</td>
                  <td class="px-3 py-2">{row.account_code}</td>
                  <td class="px-3 py-2">{row.account_name}</td>
                  <td class="px-3 py-2 text-right">{formatAmount(row.amount)}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </ReportPageLayout>
    </FinanceLayout>
  );
}
