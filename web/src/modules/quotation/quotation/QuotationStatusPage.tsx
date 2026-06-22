import { createSignal, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { useToast } from "../../../shared/toast";
import {
  patchQuotationProgressFromReport,
  useInvalidateQuotationStatusReport,
  useQuotationStatusReport,
} from "../../../shared/useQuotationStatusReport";
import { QuotationLayout } from "../QuotationLayout";
import { QuotationModal, type QuotationDetail } from "./QuotationModal";
import { QuotationStatusFilter } from "./QuotationStatusFilter";
import { QuotationStatusReport } from "./QuotationStatusReport";
import { defaultStatusFilters, type QuotationStatusFilters } from "./quotationStatusFilters";

export default function QuotationStatusPage() {
  const toast = useToast();
  const invalidate = useInvalidateQuotationStatusReport();

  const [draftFilters, setDraftFilters] = createSignal<QuotationStatusFilters>(defaultStatusFilters());
  const [submittedFilters, setSubmittedFilters] = createSignal<QuotationStatusFilters | null>(null);
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const pageSize = 50;

  const [modalOpen, setModalOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<QuotationDetail | null>(null);

  const report = useQuotationStatusReport(() => ({
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

  const openQuotation = async (quotationId: number) => {
    const res = await apiFetch<QuotationDetail>(`/api/v1/quotation/quotations/${quotationId}`);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? "Failed to load quotation.");
      return;
    }
    setEditing(res.data);
    setModalOpen(true);
  };

  const onProgressChange = async (quotationId: number, status: string) => {
    const res = await patchQuotationProgressFromReport(quotationId, status);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to update progress.");
      return;
    }
    invalidate();
  };

  return (
    <QuotationLayout>
      <QuotationStatusFilter value={draftFilters} onChange={setDraftFilters} onSearch={search} onReset={reset} />

      <Show when={submittedFilters()}>
        <QuotationStatusReport
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
          onDateNoClick={(id) => void openQuotation(id)}
          onProgressChange={(id, status) => void onProgressChange(id, status)}
        />
      </Show>

      <QuotationModal
        open={modalOpen()}
        editing={editing()}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          invalidate();
          setModalOpen(false);
        }}
      />
    </QuotationLayout>
  );
}
