import { createSignal, Show } from "solid-js";
import { useInvalidateOutstandingReport, useOutstandingReport } from "../../../shared/useOutstandingReport";
import { QuotationLayout } from "../QuotationLayout";
import { OutstandingQuoteStatusFilter } from "./OutstandingQuoteStatusFilter";
import { OutstandingQuoteStatusReport } from "./OutstandingQuoteStatusReport";
import { defaultOutstandingFilters, type OutstandingQuoteFilters } from "./quotationStatusFilters";

export default function OutstandingQuoteStatusPage() {
  const invalidate = useInvalidateOutstandingReport();

  const [draftFilters, setDraftFilters] = createSignal<OutstandingQuoteFilters>(defaultOutstandingFilters());
  const [submittedFilters, setSubmittedFilters] = createSignal<OutstandingQuoteFilters | null>(null);
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const pageSize = 50;

  const report = useOutstandingReport(() => ({
    filters: submittedFilters() ?? defaultOutstandingFilters(),
    page: page(),
    pageSize,
    sort: "order_date",
    order: "desc",
    enabled: submittedFilters() !== null,
  }));

  const search = () => {
    setSubmittedFilters({ ...draftFilters() });
    setPage(1);
    setGeneratedAt(new Date());
    invalidate();
  };

  const reset = () => {
    setDraftFilters(defaultOutstandingFilters());
    setSubmittedFilters(null);
    setPage(1);
  };

  return (
    <QuotationLayout>
      <OutstandingQuoteStatusFilter value={draftFilters} onChange={setDraftFilters} onSearch={search} onReset={reset} />

      <Show when={submittedFilters()}>
        <OutstandingQuoteStatusReport
          filters={submittedFilters()!}
          rows={report.data?.rows ?? []}
          totalBalanceQty={report.data?.summary.total_balance_qty ?? 0}
          totalAmount={report.data?.summary.total_amount ?? 0}
          totalRows={report.data?.total ?? 0}
          page={page()}
          pageSize={pageSize}
          loading={report.isFetching}
          generatedAt={generatedAt}
          onPageChange={setPage}
        />
      </Show>
    </QuotationLayout>
  );
}
