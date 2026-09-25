import { createSignal } from "solid-js";
import { useSalesDiscountStatusReport } from "../../../shared/useSalesDiscountStatusReport";
import { SalesLayout } from "../SalesLayout";
import { SalesDiscountStatusFilter } from "./SalesDiscountStatusFilter";
import { SalesDiscountStatusReport } from "./SalesDiscountStatusReport";
import { defaultDiscountStatusFilters, type SalesDiscountStatusFilters } from "./salesDiscountStatusFilters";
import {
  loadDiscountStatusTemplate,
  saveDiscountStatusTemplate,
  type DiscountSortField,
  type SalesDiscountStatusTemplate,
} from "./salesDiscountStatusTemplate";

const SUBTOTAL_PAGE_SIZE = 5000;

export default function SalesDiscountStatusPage() {
  const [draftFilters, setDraftFilters] = createSignal<SalesDiscountStatusFilters>(defaultDiscountStatusFilters());
  const [submittedFilters, setSubmittedFilters] = createSignal<SalesDiscountStatusFilters>(defaultDiscountStatusFilters());
  const [template, setTemplate] = createSignal<SalesDiscountStatusTemplate>(loadDiscountStatusTemplate());
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const [pageSize, setPageSize] = createSignal(50);

  const useSubtotalMode = () => template().subtotalBy !== "none";
  const effectivePageSize = () => (useSubtotalMode() ? SUBTOTAL_PAGE_SIZE : pageSize());
  const effectivePage = () => (useSubtotalMode() ? 1 : page());

  const report = useSalesDiscountStatusReport(() => ({
    filters: submittedFilters(),
    template: template(),
    page: effectivePage(),
    pageSize: effectivePageSize(),
    enabled: true,
  }));

  const toggleSort = (field: DiscountSortField) => {
    setTemplate((prev) => {
      const sortOrder: "asc" | "desc" =
        prev.sortField === field && prev.sortOrder === "desc" ? "asc" : "desc";
      const next: SalesDiscountStatusTemplate = {
        ...prev,
        sortField: field,
        sortOrder: prev.sortField === field ? sortOrder : "desc",
      };
      saveDiscountStatusTemplate(next);
      return next;
    });
  };

  return (
    <SalesLayout>
      <SalesDiscountStatusFilter
        value={draftFilters}
        onChange={setDraftFilters}
        template={template}
        onTemplateChange={setTemplate}
        onSearch={() => { setSubmittedFilters({ ...draftFilters() }); setPage(1); setGeneratedAt(new Date()); }}
        onReset={() => { const next = defaultDiscountStatusFilters(); setDraftFilters(next); setSubmittedFilters(next); setPage(1); }}
      />
      <SalesDiscountStatusReport
        filters={submittedFilters()}
          template={template()}
          rows={report.data?.rows ?? []}
          totalSales={report.data?.summary.total_sales_amount ?? 0}
          totalInvoicing={report.data?.summary.total_invoicing_amount ?? 0}
          totalDifference={report.data?.summary.total_difference_amount ?? 0}
          totalRows={report.data?.total ?? 0}
          page={effectivePage()}
          pageSize={effectivePageSize()}
          onPageSizeChange={setPageSize}
          loading={report.isFetching}
          generatedAt={generatedAt}
          subtotalMode={useSubtotalMode()}
          onPageChange={setPage}
          onSort={toggleSort}
        />
    </SalesLayout>
  );
}
