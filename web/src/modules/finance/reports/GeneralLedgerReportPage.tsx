import { A } from "@solidjs/router";
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import { defaultReportDateRange, ReportPageLayout } from "../../../shared/reports/ReportPageLayout";
import { downloadReportCsv } from "../../../shared/reports/downloadReportCsv";
import {
  generalLedgerExportUrl,
  useGeneralLedgerReport,
  type DateRangeFilters,
  type GeneralLedgerRow,
} from "../../../shared/reports/useModuleReports";
import { FinanceLayout } from "../FinanceLayout";
import { formatMoney } from "../../../shared/money";

function ledgerTraceHref(row: GeneralLedgerRow): string {
  const je = row.journal_entry_id ?? 0;
  if (row.source_type === "sa_sales" && row.source_id) {
    return `/app/sales/sales?openId=${row.source_id}`;
  }
  if (row.source_type === "fin_supplier_invoice" && row.source_id) {
    return `/app/purchases/purchase-receive?openId=${row.source_id}`;
  }
  if (row.source_type === "official_receipt" && row.source_id) {
    return `/app/finance/official-receipts?openId=${row.source_id}`;
  }
  return `/app/finance/acct-i/journal-entries?highlight=${je}`;
}

export default function GeneralLedgerReportPage() {
  const defaults = defaultReportDateRange();
  const [submitted, setSubmitted] = createSignal(true);
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const [filters, setFilters] = createSignal<DateRangeFilters>(defaults);
  const [pageSize, setPageSize] = createSignal(50);

  const report = useGeneralLedgerReport(() => ({
    filters: filters(),
    page: page(),
    pageSize: pageSize(),
    sort: "entry_date",
    order: "desc",
    enabled: submitted(),
  }));

  const pageTotals = createMemo(() => {
    let debit = 0;
    let credit = 0;
    for (const row of report.data?.rows ?? []) {
      debit += Number(row.debit) || 0;
      credit += Number(row.credit) || 0;
    }
    return { debit, credit };
  });

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
        title="General Ledger"
        companyWideBooksNote
        description="Posted journal entry lines — Search (F8)."
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
        onExportCsv={() => void downloadReportCsv(generalLedgerExportUrl(filters()), "general-ledger.csv")}
      >
        <Show when={submitted() && report.data?.hasJournalData === false}>
          <p class="px-5 py-4 text-sm text-amber-700">
            No posted journal entries yet. Post journal entries to populate this report.
          </p>
        </Show>
        <table class="erp-grid min-w-full text-left text-sm">
          <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
            <tr>
              <th class="px-3 py-2">Date</th>
              <th class="px-3 py-2">Entry No</th>
              <th class="px-3 py-2">Account</th>
              <th class="px-3 py-2 text-right">Debit</th>
              <th class="px-3 py-2 text-right">Credit</th>
              <th class="px-3 py-2">Party</th>
              <th class="px-3 py-2">Remarks</th>
            </tr>
          </thead>
          <tbody>
            <For each={report.data?.rows ?? []}>
              {(row) => (
                <tr class="border-t border-stroke/60">
                  <td class="px-3 py-2">{row.entry_date}</td>
                  <td class="px-3 py-2">
                    <A href={ledgerTraceHref(row)} class="text-brand-700 hover:underline">
                      {row.entry_no}
                    </A>
                  </td>
                  <td class="px-3 py-2">
                    {row.account_code} — {row.account_name}
                  </td>
                  <td class="px-3 py-2 text-right tabular-nums">
                    <A href={ledgerTraceHref(row)} class="text-brand-700 hover:underline">
                      {formatMoney(row.debit)}
                    </A>
                  </td>
                  <td class="px-3 py-2 text-right tabular-nums">
                    <A href={ledgerTraceHref(row)} class="text-brand-700 hover:underline">
                      {formatMoney(row.credit)}
                    </A>
                  </td>
                  <td class="px-3 py-2">{row.party_name ?? ""}</td>
                  <td class="px-3 py-2">{row.remarks ?? ""}</td>
                </tr>
              )}
            </For>
          </tbody>
          <Show when={(report.data?.rows?.length ?? 0) > 0}>
            <tfoot>
              <tr class="border-t-2 border-brand-200 bg-slate-50 font-semibold text-text-primary">
                <td class="px-3 py-2" colspan={3}>
                  Page total
                </td>
                <td class="px-3 py-2 text-right tabular-nums">{formatMoney(pageTotals().debit)}</td>
                <td class="px-3 py-2 text-right tabular-nums">{formatMoney(pageTotals().credit)}</td>
                <td class="px-3 py-2" colspan={2} />
              </tr>
            </tfoot>
          </Show>
        </table>
      </ReportPageLayout>
    </FinanceLayout>
  );
}
