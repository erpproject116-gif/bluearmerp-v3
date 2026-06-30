import { createSignal, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { useToast } from "../../../shared/toast";
import {
  patchPurchaseRequestProgressFromReport,
  useInvalidatePurchaseRequestStatusReport,
  usePurchaseRequestStatusReport,
} from "../../../shared/usePurchaseRequestStatusReport";
import { PurchaseRequestLayout } from "../PurchaseRequestLayout";
import { PurchaseRequestModal, type PurchaseRequestDetail } from "./PurchaseRequestModal";
import { PurchaseRequestStatusFilter } from "./PurchaseRequestStatusFilter";
import { PurchaseRequestStatusReport } from "./PurchaseRequestStatusReport";
import { defaultStatusFilters, type PurchaseRequestStatusFilters } from "./purchaseRequestStatusFilters";

export default function PurchaseRequestStatusPage() {
  const toast = useToast();
  const invalidate = useInvalidatePurchaseRequestStatusReport();

  const [draftFilters, setDraftFilters] = createSignal<PurchaseRequestStatusFilters>(defaultStatusFilters());
  const [submittedFilters, setSubmittedFilters] = createSignal<PurchaseRequestStatusFilters | null>(null);
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const pageSize = 50;

  const [modalOpen, setModalOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<PurchaseRequestDetail | null>(null);

  const report = usePurchaseRequestStatusReport(() => ({
    filters: submittedFilters() ?? defaultStatusFilters(),
    page: page(),
    pageSize,
    sort: "request_date",
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

  const openPurchaseRequest = async (purchaseRequestId: number) => {
    const res = await apiFetch<PurchaseRequestDetail>(`/api/v1/purchase-request/purchase-requests/${purchaseRequestId}`);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? "Failed to load purchase request.");
      return;
    }
    setEditing(res.data);
    setModalOpen(true);
  };

  const onProgressChange = async (purchaseRequestId: number, status: string) => {
    const res = await patchPurchaseRequestProgressFromReport(purchaseRequestId, status);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to update progress.");
      return;
    }
    invalidate();
  };

  return (
    <PurchaseRequestLayout>
      <PurchaseRequestStatusFilter value={draftFilters} onChange={setDraftFilters} onSearch={search} onReset={reset} />

      <Show when={submittedFilters()}>
        <PurchaseRequestStatusReport
          filters={submittedFilters()!}
          rows={report.data?.rows ?? []}
          totalQty={report.data?.summary.total_qty ?? 0}
          totalAmount={report.data?.summary.total_amount ?? 0}
          totalRows={report.data?.total ?? 0}
          page={page()}
          pageSize={pageSize}
          loading={report.isFetching}
          generatedAt={generatedAt}
          onPageChange={setPage}
          onDateNoClick={(id) => void openPurchaseRequest(id)}
          onProgressChange={(id, status) => void onProgressChange(id, status)}
          onApprovalChanged={() => invalidate()}
        />
      </Show>

      <PurchaseRequestModal
        open={modalOpen()}
        editing={editing()}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          invalidate();
          setModalOpen(false);
        }}
      />
    </PurchaseRequestLayout>
  );
}
