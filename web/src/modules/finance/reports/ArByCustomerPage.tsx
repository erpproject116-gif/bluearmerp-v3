import { createSignal, Show } from "solid-js";
import { useArByCustomerReport } from "../../../shared/useArByCustomerReport";
import { FinanceLayout } from "../FinanceLayout";
import { ArByCustomerFilter } from "./ArByCustomerFilter";
import { ArByCustomerReport } from "./ArByCustomerReport";
import { defaultArFilters, type ArByCustomerFilters } from "./arByCustomerFilters";

export default function ArByCustomerPage() {
  const [draftFilters, setDraftFilters] = createSignal<ArByCustomerFilters>(defaultArFilters());
  const [submittedFilters, setSubmittedFilters] = createSignal<ArByCustomerFilters | null>(null);
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const pageSize = 50;

  const report = useArByCustomerReport(() => ({
    filters: submittedFilters() ?? defaultArFilters(),
    page: page(),
    pageSize,
    sort: "customer_name",
    order: "asc",
    enabled: submittedFilters() !== null,
  }));

  const search = () => {
    setSubmittedFilters({ ...draftFilters() });
    setPage(1);
    setGeneratedAt(new Date());
  };

  const reset = () => {
    setDraftFilters(defaultArFilters());
    setSubmittedFilters(null);
    setPage(1);
  };

  return (
    <FinanceLayout>
      <ArByCustomerFilter value={draftFilters} onChange={setDraftFilters} onSearch={search} onReset={reset} />
      <Show when={submittedFilters()}>
        <ArByCustomerReport
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
