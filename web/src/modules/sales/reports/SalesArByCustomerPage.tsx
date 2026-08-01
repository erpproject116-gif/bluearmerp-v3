import { createSignal } from "solid-js";
import { useArByCustomerReport } from "../../../shared/useArByCustomerReport";
import { ArByCustomerFilter } from "../../finance/reports/ArByCustomerFilter";
import { ArByCustomerReport } from "../../finance/reports/ArByCustomerReport";
import { defaultArFilters, type ArByCustomerFilters } from "../../finance/reports/arByCustomerFilters";
import { SalesLayout } from "../SalesLayout";

export default function SalesArByCustomerPage() {
  const [draftFilters, setDraftFilters] = createSignal<ArByCustomerFilters>(defaultArFilters());
  const [submittedFilters, setSubmittedFilters] = createSignal<ArByCustomerFilters>(defaultArFilters());
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const pageSize = 50;

  const report = useArByCustomerReport(() => ({
    filters: submittedFilters(),
    page: page(),
    pageSize,
    sort: "last_txn_date",
    order: "desc",
    enabled: true,
  }));

  return (
    <SalesLayout>
      <ArByCustomerFilter
        value={draftFilters}
        onChange={setDraftFilters}
        onSearch={() => {
          setSubmittedFilters({ ...draftFilters() });
          setPage(1);
          setGeneratedAt(new Date());
        }}
        onReset={() => {
          const next = defaultArFilters();
          setDraftFilters(next);
          setSubmittedFilters(next);
          setPage(1);
          setGeneratedAt(new Date());
        }}
      />
      <ArByCustomerReport
        filters={submittedFilters()}
        rows={report.data?.rows ?? []}
        totalRows={report.data?.total ?? 0}
        page={page()}
        pageSize={pageSize}
        loading={report.isFetching && !report.data}
        generatedAt={generatedAt}
        onPageChange={setPage}
      />
    </SalesLayout>
  );
}
