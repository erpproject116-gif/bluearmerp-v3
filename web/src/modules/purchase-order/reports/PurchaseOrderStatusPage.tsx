import { createSignal, Show } from "solid-js";
import {
  useInvalidatePurchaseOrderStatusReport,
  usePurchaseOrderStatusReport,
} from "../../../shared/usePurchaseOrderStatusReport";
import { PurchaseRequestLayout } from "../../purchase-request/PurchaseRequestLayout";
import {
  PurchaseOrderModal,
} from "../../purchase-request/purchase-order/PurchaseOrderModal";
import { PurchaseOrderStatusFilter } from "./PurchaseOrderStatusFilter";
import { PurchaseOrderStatusReport } from "./PurchaseOrderStatusReport";
import { defaultStatusFilters, type PurchaseOrderStatusFilters } from "./purchaseOrderStatusFilters";

export default function PurchaseOrderStatusPage() {
  const invalidate = useInvalidatePurchaseOrderStatusReport();

  const [draftFilters, setDraftFilters] = createSignal<PurchaseOrderStatusFilters>(defaultStatusFilters());
  const [submittedFilters, setSubmittedFilters] = createSignal<PurchaseOrderStatusFilters | null>(null);
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const [pageSize, setPageSize] = createSignal(50);

  const [modalOpen, setModalOpen] = createSignal(false);
  const [purchaseOrderId, setPurchaseOrderId] = createSignal<number | null>(null);

  const report = usePurchaseOrderStatusReport(() => ({
    filters: submittedFilters() ?? defaultStatusFilters(),
    page: page(),
    pageSize: pageSize(),
    sort: "order_date",
    order: "desc",
    enabled: submittedFilters() !== null,
  }));

  const search = () => {
    setSubmittedFilters({ ...draftFilters() });
    setPage(1);
    setGeneratedAt(new Date());
  };

  const reset = () => {
    setDraftFilters(defaultStatusFilters());
    setSubmittedFilters(null);
    setPage(1);
  };

  const openPurchaseOrder = (id: number) => {
    setPurchaseOrderId(id);
    setModalOpen(true);
  };

  return (
    <PurchaseRequestLayout>
      <PurchaseOrderStatusFilter value={draftFilters} onChange={setDraftFilters} onSearch={search} onReset={reset} />

      <Show when={submittedFilters()}>
        <PurchaseOrderStatusReport
          filters={submittedFilters()!}
          rows={report.data?.rows ?? []}
          totalQty={report.data?.summary.total_qty ?? 0}
          totalAmount={report.data?.summary.total_amount ?? 0}
          totalRows={report.data?.total ?? 0}
          page={page()}
          pageSize={pageSize()} onPageSizeChange={setPageSize}
          loading={report.isFetching}
          generatedAt={generatedAt}
          onPageChange={setPage}
          onDateNoClick={(id) => void openPurchaseOrder(id)}
        />
      </Show>

      <PurchaseOrderModal
        open={modalOpen()}
        purchaseOrderId={purchaseOrderId()}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          invalidate();
          setModalOpen(false);
        }}
      />
    </PurchaseRequestLayout>
  );
}
