import { createSignal } from "solid-js";
import { useApByVendorReport } from "../../../shared/useApByVendorReport";
import { FinanceLayout } from "../FinanceLayout";
import { ApByVendorFilter } from "./ApByVendorFilter";
import { ApByVendorReport } from "./ApByVendorReport";
import { defaultApFilters, type ApByVendorFilters } from "./apByVendorFilters";

export default function ApByVendorPage() {
  const [draftFilters, setDraftFilters] = createSignal<ApByVendorFilters>(defaultApFilters());
  const [submittedFilters, setSubmittedFilters] = createSignal<ApByVendorFilters>(defaultApFilters());
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const [pageSize, setPageSize] = createSignal(50);

  const report = useApByVendorReport(() => ({
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
    const next = defaultApFilters();
    setDraftFilters(next);
    setSubmittedFilters(next);
    setPage(1);
    setGeneratedAt(new Date());
  };

  return (
    <FinanceLayout>
      <ApByVendorFilter value={draftFilters} onChange={setDraftFilters} onSearch={search} onReset={reset} />
      <ApByVendorReport
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
