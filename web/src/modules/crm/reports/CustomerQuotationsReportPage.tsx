import { createSignal, Show } from "solid-js";
import { useCustomerQuotationsReport } from "../../../shared/useCrmReports";
import { CrmLayout } from "../CrmLayout";
import { CustomerQuotationsFilter } from "./CustomerQuotationsFilter";
import { CustomerQuotationsReport } from "./CustomerQuotationsReport";
import { defaultCustomerQuotationsFilters, type CustomerQuotationsFilters } from "./customerQuotationsFilters";

export default function CustomerQuotationsReportPage() {
  const [draftFilters, setDraftFilters] = createSignal<CustomerQuotationsFilters>(defaultCustomerQuotationsFilters());
  const [submittedFilters, setSubmittedFilters] = createSignal<CustomerQuotationsFilters | null>(null);
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const [pageSize, setPageSize] = createSignal(50);

  const report = useCustomerQuotationsReport(() => ({
    filters: submittedFilters() ?? defaultCustomerQuotationsFilters(),
    page: page(),
    pageSize: pageSize(),
    sort: "quotation_count",
    order: "desc",
    enabled: submittedFilters() !== null,
  }));

  const search = () => {
    if (!draftFilters().item_id) return;
    setSubmittedFilters({ ...draftFilters() });
    setPage(1);
    setGeneratedAt(new Date());
  };

  const reset = () => {
    setDraftFilters(defaultCustomerQuotationsFilters());
    setSubmittedFilters(null);
    setPage(1);
  };

  return (
    <CrmLayout>
      <CustomerQuotationsFilter value={draftFilters} onChange={setDraftFilters} onSearch={search} onReset={reset} />
      <Show when={submittedFilters()}>
        <CustomerQuotationsReport
          filters={submittedFilters()!}
          rows={report.data?.rows ?? []}
          totalRows={report.data?.total ?? 0}
          page={page()}
          pageSize={pageSize()} onPageSizeChange={setPageSize}
          loading={report.isFetching}
          generatedAt={generatedAt}
          onPageChange={setPage}
        />
      </Show>
    </CrmLayout>
  );
}
