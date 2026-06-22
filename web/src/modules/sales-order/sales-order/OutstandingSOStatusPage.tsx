import { createSignal, Show } from "solid-js";
import {
  useInvalidateSalesOrderOutstandingReport,
  useSalesOrderOutstandingReport,
} from "../../../shared/useSalesOrderOutstandingReport";
import { SalesOrderLayout } from "../SalesOrderLayout";
import { OutstandingSOStatusFilter } from "./OutstandingSOStatusFilter";
import { OutstandingSOStatusReport } from "./OutstandingSOStatusReport";
import { defaultOutstandingFilters, type OutstandingSOFilters } from "./salesOrderStatusFilters";

export default function OutstandingSOStatusPage() {
  const invalidate = useInvalidateSalesOrderOutstandingReport();

  const [draftFilters, setDraftFilters] = createSignal<OutstandingSOFilters>(defaultOutstandingFilters());
  const [submittedFilters, setSubmittedFilters] = createSignal<OutstandingSOFilters | null>(null);
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const pageSize = 50;

  const report = useSalesOrderOutstandingReport(() => ({
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
    <SalesOrderLayout>
      <OutstandingSOStatusFilter value={draftFilters} onChange={setDraftFilters} onSearch={search} onReset={reset} />

      <Show when={submittedFilters()}>
        <OutstandingSOStatusReport
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
    </SalesOrderLayout>
  );
}
