import { createSignal, Show } from "solid-js";
import { useArByCustomerReport } from "../../../shared/useArByCustomerReport";
import { ArByCustomerFilter } from "../../finance/reports/ArByCustomerFilter";
import { ArByCustomerReport } from "../../finance/reports/ArByCustomerReport";
import { defaultArFilters, type ArByCustomerFilters } from "../../finance/reports/arByCustomerFilters";
import { SalesLayout } from "../SalesLayout";

export default function SalesArByCustomerPage() {
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

  return (
    <SalesLayout>
      <ArByCustomerFilter value={draftFilters} onChange={setDraftFilters} onSearch={() => { setSubmittedFilters({ ...draftFilters() }); setPage(1); setGeneratedAt(new Date()); }} onReset={() => { setDraftFilters(defaultArFilters()); setSubmittedFilters(null); setPage(1); }} />
      <Show when={submittedFilters()}>
        <ArByCustomerReport filters={submittedFilters()!} rows={report.data?.rows ?? []} totalRows={report.data?.total ?? 0} page={page()} pageSize={pageSize} loading={report.isFetching} generatedAt={generatedAt} onPageChange={setPage} />
      </Show>
    </SalesLayout>
  );
}
