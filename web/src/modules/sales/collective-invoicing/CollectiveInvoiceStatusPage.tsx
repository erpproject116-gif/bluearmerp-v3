import { createSignal, Show } from "solid-js";
import { useCollectiveInvoiceStatusReport } from "../../../shared/useCollectiveInvoiceStatusReport";
import { SalesLayout } from "../SalesLayout";
import { CollectiveInvoiceStatusFilter } from "./CollectiveInvoiceStatusFilter";
import { CollectiveInvoiceStatusReport } from "./CollectiveInvoiceStatusReport";
import { defaultCollectiveInvoiceStatusFilters, type CollectiveInvoiceStatusFilters } from "./collectiveInvoiceStatusFilters";
import {
  loadCollectiveInvoiceStatusTemplate,
  saveCollectiveInvoiceStatusTemplate,
  type CollectiveInvoiceStatusTemplate,
  type InvoiceSortField,
} from "./collectiveInvoiceStatusTemplate";

const SUBTOTAL_PAGE_SIZE = 5000;

export default function CollectiveInvoiceStatusPage() {
  const [draftFilters, setDraftFilters] = createSignal<CollectiveInvoiceStatusFilters>(defaultCollectiveInvoiceStatusFilters());
  const [submittedFilters, setSubmittedFilters] = createSignal<CollectiveInvoiceStatusFilters | null>(null);
  const [template, setTemplate] = createSignal<CollectiveInvoiceStatusTemplate>(loadCollectiveInvoiceStatusTemplate());
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const pageSize = 50;

  const useSubtotalMode = () => (submittedFilters() ? template().subtotalBy !== "none" : false);
  const effectivePageSize = () => (useSubtotalMode() ? SUBTOTAL_PAGE_SIZE : pageSize);
  const effectivePage = () => (useSubtotalMode() ? 1 : page());

  const report = useCollectiveInvoiceStatusReport(() => ({
    filters: submittedFilters() ?? defaultCollectiveInvoiceStatusFilters(),
    template: template(),
    page: effectivePage(),
    pageSize: effectivePageSize(),
    enabled: submittedFilters() !== null,
  }));

  const toggleSort = (field: InvoiceSortField) => {
    setTemplate((prev) => {
      const sortOrder: "asc" | "desc" =
        prev.sortField === field && prev.sortOrder === "desc" ? "asc" : "desc";
      const next: CollectiveInvoiceStatusTemplate = {
        ...prev,
        sortField: field,
        sortOrder: prev.sortField === field ? sortOrder : "desc",
      };
      saveCollectiveInvoiceStatusTemplate(next);
      return next;
    });
  };

  return (
    <SalesLayout>
      <CollectiveInvoiceStatusFilter
        value={draftFilters}
        onChange={setDraftFilters}
        template={template}
        onTemplateChange={setTemplate}
        onSearch={() => { setSubmittedFilters({ ...draftFilters() }); setPage(1); setGeneratedAt(new Date()); }}
        onReset={() => { setDraftFilters(defaultCollectiveInvoiceStatusFilters()); setSubmittedFilters(null); setPage(1); }}
      />
      <Show when={submittedFilters()}>
        <CollectiveInvoiceStatusReport
          filters={submittedFilters()!}
          template={template()}
          rows={report.data?.rows ?? []}
          totalPretax={report.data?.summary.total_pretax ?? 0}
          totalTax={report.data?.summary.total_tax ?? 0}
          totalSales={report.data?.summary.total_sales ?? 0}
          totalRows={report.data?.total ?? 0}
          page={effectivePage()}
          pageSize={effectivePageSize()}
          loading={report.isFetching}
          generatedAt={generatedAt}
          subtotalMode={useSubtotalMode()}
          onPageChange={setPage}
          onSort={toggleSort}
        />
      </Show>
    </SalesLayout>
  );
}
