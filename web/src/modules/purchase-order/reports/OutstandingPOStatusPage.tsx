import { createSignal, Show } from "solid-js";
import {
  useInvalidatePurchaseOrderOutstandingReport,
  usePurchaseOrderOutstandingReport,
} from "../../../shared/usePurchaseOrderOutstandingReport";
import { PurchaseRequestLayout } from "../../purchase-request/PurchaseRequestLayout";
import { OutstandingPOStatusFilter } from "./OutstandingPOStatusFilter";
import { OutstandingPOStatusReport } from "./OutstandingPOStatusReport";
import { defaultOutstandingFilters, type OutstandingPOFilters } from "./purchaseOrderStatusFilters";

export default function OutstandingPOStatusPage() {
  const invalidate = useInvalidatePurchaseOrderOutstandingReport();

  const [draftFilters, setDraftFilters] = createSignal<OutstandingPOFilters>(defaultOutstandingFilters());
  const [submittedFilters, setSubmittedFilters] = createSignal<OutstandingPOFilters | null>(null);
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const pageSize = 50;

  const report = usePurchaseOrderOutstandingReport(() => ({
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
    <PurchaseRequestLayout>
      <OutstandingPOStatusFilter value={draftFilters} onChange={setDraftFilters} onSearch={search} onReset={reset} />

      <Show when={submittedFilters()}>
        <OutstandingPOStatusReport
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
    </PurchaseRequestLayout>
  );
}
