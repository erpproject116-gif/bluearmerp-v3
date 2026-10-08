import { createSignal, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { AfterSalesLayout } from "./AfterSalesLayout";
import { RepairOrderModal, type RepairOrderDetail } from "./RepairOrderModal";
import { RepairOrderStatusFilter } from "./RepairOrderStatusFilter";
import { RepairOrderStatusReport } from "./RepairOrderStatusReport";
import { defaultStatusFilters, type RepairOrderStatusFilters } from "./repairOrderStatusFilters";
import {
  patchRepairOrderProgress,
  useInvalidateStatusReport,
  useRepairOrderStatusReport,
} from "../../../shared/useRepairOrderStatusReport";
import { useToast } from "../../../shared/toast";

export default function RepairOrderStatusPage() {
  const toast = useToast();
  const invalidate = useInvalidateStatusReport();

  const [draftFilters, setDraftFilters] = createSignal<RepairOrderStatusFilters>(defaultStatusFilters());
  const [submittedFilters, setSubmittedFilters] = createSignal<RepairOrderStatusFilters | null>(null);
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const [pageSize, setPageSize] = createSignal(50);

  const [modalOpen, setModalOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<RepairOrderDetail | null>(null);

  const report = useRepairOrderStatusReport(() => ({
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

  const openOrder = async (repairOrderId: number) => {
    const res = await apiFetch<RepairOrderDetail>(`/api/v1/inventory/repair-orders/${repairOrderId}`);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? "Failed to load repair order.");
      return;
    }
    setEditing(res.data);
    setModalOpen(true);
  };

  const warnPatch = (res: { message?: string; errors?: Record<string, string> }, fallback: string) => {
    const detail = res.errors && Object.values(res.errors).find((message) => message);
    toast.warning(detail || res.message || fallback);
  };

  const onProgressChange = async (repairOrderId: number, status: string) => {
    const res = await patchRepairOrderProgress(repairOrderId, { progress_status: status });
    if (!res.success) {
      warnPatch(res, "Failed to update progress.");
      invalidate();
      return;
    }
    invalidate();
  };

  const onCoverageChange = async (repairOrderId: number, progress: string, coverage: string) => {
    const res = await patchRepairOrderProgress(repairOrderId, {
      progress_status: progress,
      coverage_decision: coverage,
    });
    if (!res.success) {
      warnPatch(res, "Failed to update coverage.");
      invalidate();
      return;
    }
    invalidate();
  };

  const onRecoveryChange = async (repairOrderId: number, progress: string, recovery: string) => {
    const res = await patchRepairOrderProgress(repairOrderId, {
      progress_status: progress,
      supplier_recovery: recovery,
    });
    if (!res.success) {
      warnPatch(res, "Failed to update supplier recovery.");
      invalidate();
      return;
    }
    invalidate();
  };

  return (
    <AfterSalesLayout>
      <RepairOrderStatusFilter
        value={draftFilters}
        onChange={setDraftFilters}
        onSearch={search}
        onReset={reset}
      />

      <Show when={submittedFilters()}>
        <RepairOrderStatusReport
          filters={submittedFilters()!}
          rows={report.data?.rows ?? []}
          totalQty={report.data?.summary.total_qty ?? 0}
          totalRows={report.data?.total ?? 0}
          page={page()}
          pageSize={pageSize()} onPageSizeChange={setPageSize}
          loading={report.isFetching}
          generatedAt={generatedAt}
          onPageChange={setPage}
          onDateNoClick={(id) => void openOrder(id)}
          onProgressChange={(id, status) => void onProgressChange(id, status)}
          onCoverageChange={(id, progress, coverage) => void onCoverageChange(id, progress, coverage)}
          onRecoveryChange={(id, progress, recovery) => void onRecoveryChange(id, progress, recovery)}
        />
      </Show>

      <RepairOrderModal
        open={modalOpen()}
        editing={editing()}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          invalidate();
          setModalOpen(false);
        }}
      />
    </AfterSalesLayout>
  );
}
