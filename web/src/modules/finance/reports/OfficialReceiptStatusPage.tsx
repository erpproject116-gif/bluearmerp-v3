import { createSignal, Show } from "solid-js";
import { useOfficialReceiptStatusReport } from "../../../shared/useOfficialReceiptStatusReport";
import { ReceiptJournalModal } from "../official-receipts/ReceiptJournalModal";
import { FinanceLayout } from "../FinanceLayout";
import { OfficialReceiptStatusFilter } from "./OfficialReceiptStatusFilter";
import { OfficialReceiptStatusReport } from "./OfficialReceiptStatusReport";
import { defaultOfficialReceiptStatusFilters, type OfficialReceiptStatusFilters } from "./officialReceiptStatusFilters";

export default function OfficialReceiptStatusPage() {
  const [draftFilters, setDraftFilters] = createSignal<OfficialReceiptStatusFilters>(defaultOfficialReceiptStatusFilters());
  const [submittedFilters, setSubmittedFilters] = createSignal<OfficialReceiptStatusFilters | null>(null);
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const [journalReceiptId, setJournalReceiptId] = createSignal<number | null>(null);
  const pageSize = 50;

  const report = useOfficialReceiptStatusReport(() => ({
    filters: submittedFilters() ?? defaultOfficialReceiptStatusFilters(),
    page: page(),
    pageSize,
    sort: "receipt_date",
    order: "desc",
    enabled: submittedFilters() !== null,
  }));

  const search = () => {
    setSubmittedFilters({ ...draftFilters() });
    setPage(1);
    setGeneratedAt(new Date());
  };

  const reset = () => {
    setDraftFilters(defaultOfficialReceiptStatusFilters());
    setSubmittedFilters(null);
    setPage(1);
  };

  return (
    <FinanceLayout>
      <OfficialReceiptStatusFilter value={draftFilters} onChange={setDraftFilters} onSearch={search} onReset={reset} />
      <Show when={submittedFilters()}>
        <OfficialReceiptStatusReport
          filters={submittedFilters()!}
          rows={report.data?.rows ?? []}
          totalRows={report.data?.total ?? 0}
          page={page()}
          pageSize={pageSize}
          loading={report.isFetching}
          generatedAt={generatedAt}
          onPageChange={setPage}
          onOpenReceipt={setJournalReceiptId}
        />
      </Show>
      <ReceiptJournalModal
        open={journalReceiptId() !== null}
        receiptId={journalReceiptId()}
        onClose={() => setJournalReceiptId(null)}
        onSaved={() => {
          setJournalReceiptId(null);
          void report.refetch();
        }}
      />
    </FinanceLayout>
  );
}
