import { createSignal, Show } from "solid-js";
import { useApByVendorReport } from "../../../shared/useApByVendorReport";
import { FinanceLayout } from "../FinanceLayout";
import { ApByVendorFilter } from "./ApByVendorFilter";
import { ApByVendorReport } from "./ApByVendorReport";
import { defaultApFilters, type ApByVendorFilters } from "./apByVendorFilters";

export default function ApByVendorPage() {
  const [draftFilters, setDraftFilters] = createSignal<ApByVendorFilters>(defaultApFilters());
  const [submittedFilters, setSubmittedFilters] = createSignal<ApByVendorFilters | null>(null);
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const pageSize = 50;

  const report = useApByVendorReport(() => ({
    filters: submittedFilters() ?? defaultApFilters(),
    page: page(),
    pageSize,
    sort: "vendor_name",
    order: "asc",
    enabled: submittedFilters() !== null,
  }));

  const search = () => {
    setSubmittedFilters({ ...draftFilters() });
    setPage(1);
    setGeneratedAt(new Date());
  };

  const reset = () => {
    setDraftFilters(defaultApFilters());
    setSubmittedFilters(null);
    setPage(1);
  };

  return (
    <FinanceLayout>
      <ApByVendorFilter value={draftFilters} onChange={setDraftFilters} onSearch={search} onReset={reset} />
      <Show when={submittedFilters()}>
        <ApByVendorReport
          filters={submittedFilters()!}
          rows={report.data?.rows ?? []}
          totalRows={report.data?.total ?? 0}
          page={page()}
          pageSize={pageSize}
          loading={report.isFetching}
          generatedAt={generatedAt}
          onPageChange={setPage}
        />
      </Show>
    </FinanceLayout>
  );
}
