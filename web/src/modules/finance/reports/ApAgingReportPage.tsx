import { A } from "@solidjs/router";
import { createSignal, For, onMount, Show } from "solid-js";
import { ReportPageLayout } from "../../../shared/reports/ReportPageLayout";
import { downloadReportCsv } from "../../../shared/reports/downloadReportCsv";
import { apAgingExportUrl, useApAgingReport, type AgingFilters } from "../../../shared/reports/useModuleReports";
import { FinanceLayout } from "../FinanceLayout";
import { formatAmount } from "../../../shared/money";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function ApAgingReportPage() {
  const [submitted, setSubmitted] = createSignal(false);
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const [filters, setFilters] = createSignal<AgingFilters>({ as_of: todayIso() });
  const pageSize = 50;

  const report = useApAgingReport(() => ({
    filters: filters(),
    page: page(),
    pageSize,
    sort: "age_days",
    order: "desc",
    enabled: submitted(),
  }));

  onMount(() => {
    search();
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
  const sum = () => report.data?.summary;

  return (
    <FinanceLayout>
      <ReportPageLayout
        title="A/P Aging"
        description="Payables balances grouped by aging bucket — loads as of today (Search / F8 to refresh). Click any row to open the purchase."
        dateFrom={() => filters().as_of ?? ""}
        dateTo={() => filters().as_of ?? ""}
        onDateFromChange={(v) => setFilters({ as_of: v })}
        onDateToChange={(v) => setFilters({ as_of: v })}
        submitted={submitted()}
        loading={report.isFetching}
        generatedAt={generatedAt()}
        page={page()}
        totalPages={totalPages()}
        onPageChange={setPage}
        onSearch={search}
        onReset={() => {
          setFilters({ as_of: todayIso() });
          setSubmitted(false);
          setPage(1);
        }}
        onExportCsv={() => void downloadReportCsv(apAgingExportUrl(filters()), "ap-aging.csv")}
      >
        <Show when={submitted() && sum()}>
          <div class="grid gap-2 px-5 py-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
            <span>Current: {formatAmount(sum()?.current ?? 0)}</span>
            <span>1-30: {formatAmount(sum()?.days_1_30 ?? 0)}</span>
            <span>31-60: {formatAmount(sum()?.days_31_60 ?? 0)}</span>
            <span>61-90: {formatAmount(sum()?.days_61_90 ?? 0)}</span>
            <span>90+: {formatAmount(sum()?.over_90 ?? 0)}</span>
            <span>Total: {formatAmount(sum()?.total ?? 0)}</span>
          </div>
        </Show>
        <table class="erp-grid min-w-full text-left text-sm">
          <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
            <tr>
              <th class="px-3 py-2">Invoice No</th>
              <th class="px-3 py-2">Vendor</th>
              <th class="px-3 py-2">Due Date</th>
              <th class="px-3 py-2 text-right">Balance</th>
              <th class="px-3 py-2 text-right">Age (Days)</th>
              <th class="px-3 py-2">Bucket</th>
            </tr>
          </thead>
          <tbody>
            <For each={report.data?.rows ?? []}>
              {(row) => (
                <tr
                  class="border-t border-stroke/60 hover:bg-brand-50/40 cursor-pointer"
                  onClick={() => {
                    window.location.href = `/app/purchases/purchases?openId=${row.supplier_invoice_id}`;
                  }}
                >
                  <td class="px-3 py-2">
                    <A
                      href={`/app/purchases/purchases?openId=${row.supplier_invoice_id}`}
                      class="font-medium text-brand-600 underline-offset-2 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {row.invoice_no}
                    </A>
                  </td>
                  <td class="px-3 py-2">{row.vendor_name}</td>
                  <td class="px-3 py-2">{row.due_date}</td>
                  <td class="px-3 py-2 text-right tabular-nums">{formatAmount(row.balance)}</td>
                  <td class="px-3 py-2 text-right">{row.age_days}</td>
                  <td class="px-3 py-2">{row.age_bucket}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </ReportPageLayout>
    </FinanceLayout>
  );
}
