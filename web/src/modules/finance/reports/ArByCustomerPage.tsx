import { createSignal } from "solid-js";
import { useArByCustomerReport } from "../../../shared/useArByCustomerReport";
import { FinanceLayout } from "../FinanceLayout";
import { ArByCustomerFilter } from "./ArByCustomerFilter";
import { ArByCustomerReport } from "./ArByCustomerReport";
import { defaultArFilters, type ArByCustomerFilters } from "./arByCustomerFilters";

export default function ArByCustomerPage() {
  const [draftFilters, setDraftFilters] = createSignal<ArByCustomerFilters>(defaultArFilters());
  const [submittedFilters, setSubmittedFilters] = createSignal<ArByCustomerFilters>(defaultArFilters());
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const [pageSize, setPageSize] = createSignal(50);

  const report = useArByCustomerReport(() => ({
    filters: submittedFilters(),
    page: page(),
    pageSize: pageSize(),
    sort: "last_txn_date",
    order: "desc",
    enabled: true,
  }));

  const search = () => {
    setSubmittedFilters({ ...draftFilters() });
    setPage(1);
    setGeneratedAt(new Date());
  };

  const reset = () => {
    const next = defaultArFilters();
    setDraftFilters(next);
    setSubmittedFilters(next);
    setPage(1);
    setGeneratedAt(new Date());
  };

  return (
    <FinanceLayout>
      <ArByCustomerFilter value={draftFilters} onChange={setDraftFilters} onSearch={search} onReset={reset} />
      <ArByCustomerReport
        filters={submittedFilters()}
        rows={report.data?.rows ?? []}
        totalRows={report.data?.total ?? 0}
        page={page()}
        pageSize={pageSize()} onPageSizeChange={setPageSize}
        loading={report.isFetching && !report.data}
        generatedAt={generatedAt}
        onPageChange={setPage}
      />
    </FinanceLayout>
  );
}
