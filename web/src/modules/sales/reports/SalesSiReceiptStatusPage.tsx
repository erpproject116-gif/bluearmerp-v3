import { createSignal, Show } from "solid-js";
import { useReceiptStatusReport } from "../../../shared/useReceiptStatusReport";
import { ReceiptStatusFilter } from "../../finance/reports/ReceiptStatusFilter";
import { ReceiptStatusReport } from "../../finance/reports/ReceiptStatusReport";
import { defaultReceiptStatusFilters, type ReceiptStatusFilters } from "../../finance/reports/receiptStatusFilters";
import { SalesLayout } from "../SalesLayout";

export default function SalesSiReceiptStatusPage() {
  const [draftFilters, setDraftFilters] = createSignal<ReceiptStatusFilters>(defaultReceiptStatusFilters());
  const [submittedFilters, setSubmittedFilters] = createSignal<ReceiptStatusFilters | null>(null);
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const [pageSize, setPageSize] = createSignal(50);

  const report = useReceiptStatusReport(() => ({
    filters: submittedFilters() ?? defaultReceiptStatusFilters(),
    page: page(),
    pageSize: pageSize(),
    sort: "order_date",
    order: "desc",
    enabled: submittedFilters() !== null,
  }));

  return (
    <SalesLayout>
      <ReceiptStatusFilter value={draftFilters} onChange={setDraftFilters} onSearch={() => { setSubmittedFilters({ ...draftFilters() }); setPage(1); setGeneratedAt(new Date()); }} onReset={() => { setDraftFilters(defaultReceiptStatusFilters()); setSubmittedFilters(null); setPage(1); }} />
      <Show when={submittedFilters()}>
        <ReceiptStatusReport filters={submittedFilters()!} rows={report.data?.rows ?? []} totalQty={report.data?.summary.total_qty ?? 0} totalAmount={report.data?.summary.total_amount ?? 0} totalRows={report.data?.total ?? 0} page={page()} pageSize={pageSize()} onPageSizeChange={setPageSize} loading={report.isFetching} generatedAt={generatedAt} onPageChange={setPage} />
      </Show>
    </SalesLayout>
  );
}
