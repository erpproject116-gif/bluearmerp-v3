import { createSignal, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { useToast } from "../../../shared/toast";
import {
  patchSalesOrderProgressFromReport,
  useInvalidateSalesOrderStatusReport,
  useSalesOrderStatusReport,
} from "../../../shared/useSalesOrderStatusReport";
import { SalesOrderLayout } from "../SalesOrderLayout";
import { SalesOrderModal, type SalesOrderDetail } from "./SalesOrderModal";
import { SalesOrderStatusFilter } from "./SalesOrderStatusFilter";
import { SalesOrderStatusReport } from "./SalesOrderStatusReport";
import { defaultStatusFilters, type SalesOrderStatusFilters } from "./salesOrderStatusFilters";

export default function SalesOrderStatusPage() {
  const toast = useToast();
  const invalidate = useInvalidateSalesOrderStatusReport();

  const [draftFilters, setDraftFilters] = createSignal<SalesOrderStatusFilters>(defaultStatusFilters());
  const [submittedFilters, setSubmittedFilters] = createSignal<SalesOrderStatusFilters | null>(null);
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const pageSize = 50;

  const [modalOpen, setModalOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<SalesOrderDetail | null>(null);

  const report = useSalesOrderStatusReport(() => ({
    filters: submittedFilters() ?? defaultStatusFilters(),
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
  };

  const reset = () => {
    setDraftFilters(defaultStatusFilters());
    setSubmittedFilters(null);
    setPage(1);
  };

  const openSalesOrder = async (salesOrderId: number) => {
    const res = await apiFetch<SalesOrderDetail>(`/api/v1/sales-order/sales-orders/${salesOrderId}`);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? "Failed to load sales order.");
      return;
    }
    setEditing(res.data);
    setModalOpen(true);
  };

  const onProgressChange = async (salesOrderId: number, status: string) => {
    const res = await patchSalesOrderProgressFromReport(salesOrderId, status);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to update progress.");
      return;
    }
    invalidate();
  };

  return (
    <SalesOrderLayout>
      <SalesOrderStatusFilter value={draftFilters} onChange={setDraftFilters} onSearch={search} onReset={reset} />

      <Show when={submittedFilters()}>
        <SalesOrderStatusReport
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
          onDateNoClick={(id) => void openSalesOrder(id)}
          onProgressChange={(id, status) => void onProgressChange(id, status)}
        />
      </Show>

      <SalesOrderModal
        open={modalOpen()}
        editing={editing()}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          invalidate();
          setModalOpen(false);
        }}
      />
    </SalesOrderLayout>
  );
}
