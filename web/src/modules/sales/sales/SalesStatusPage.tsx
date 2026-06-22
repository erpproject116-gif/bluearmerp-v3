import { createSignal, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { useToast } from "../../../shared/toast";
import {
  patchSalesProgressFromReport,
  useInvalidateSalesStatusReport,
  useSalesStatusReport,
} from "../../../shared/useSalesStatusReport";
import { SalesLayout } from "../SalesLayout";
import { SalesModal, type SalesDetail } from "./SalesModal";
import { SalesStatusFilter } from "./SalesStatusFilter";
import { SalesStatusReport } from "./SalesStatusReport";
import { defaultStatusFilters, type SalesStatusFilters } from "./salesStatusFilters";
import type { SalesTemplateCode } from "./SalesLineGrid";

export default function SalesStatusPage() {
  const toast = useToast();
  const invalidate = useInvalidateSalesStatusReport();

  const [draftFilters, setDraftFilters] = createSignal<SalesStatusFilters>(defaultStatusFilters());
  const [submittedFilters, setSubmittedFilters] = createSignal<SalesStatusFilters | null>(null);
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const pageSize = 50;

  const [modalOpen, setModalOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<SalesDetail | null>(null);

  const report = useSalesStatusReport(() => ({
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

  const openSales = async (salesId: number) => {
    const res = await apiFetch<SalesDetail>(`/api/v1/sales/${salesId}`);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? "Failed to load sales.");
      return;
    }
    setEditing(res.data);
    setModalOpen(true);
  };

  const onProgressChange = async (salesId: number, status: string) => {
    const res = await patchSalesProgressFromReport(salesId, status);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to update progress.");
      return;
    }
    invalidate();
  };

  const editingTemplate = (): SalesTemplateCode =>
    (editing()?.template_code ?? "default") as SalesTemplateCode;

  return (
    <SalesLayout>
      <SalesStatusFilter value={draftFilters} onChange={setDraftFilters} onSearch={search} onReset={reset} />

      <Show when={submittedFilters()}>
        <SalesStatusReport
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
          onDateNoClick={(id) => void openSales(id)}
          onProgressChange={(id, status) => void onProgressChange(id, status)}
        />
      </Show>

      <SalesModal
        open={modalOpen()}
        editing={editing()}
        templateCode={editingTemplate()}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          invalidate();
          setModalOpen(false);
        }}
      />
    </SalesLayout>
  );
}
