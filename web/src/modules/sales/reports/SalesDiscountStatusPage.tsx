import { createSignal, Show } from "solid-js";
import { useSalesDiscountStatusReport } from "../../../shared/useSalesDiscountStatusReport";
import { SalesStatusFilter } from "../sales/SalesStatusFilter";
import { defaultStatusFilters, type SalesStatusFilters } from "../sales/salesStatusFilters";
import { SalesLayout } from "../SalesLayout";
import { SalesDiscountStatusReport } from "./SalesDiscountStatusReport";

export default function SalesDiscountStatusPage() {
  const [draftFilters, setDraftFilters] = createSignal<SalesStatusFilters>(defaultStatusFilters());
  const [submittedFilters, setSubmittedFilters] = createSignal<SalesStatusFilters | null>(null);
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const pageSize = 50;

  const report = useSalesDiscountStatusReport(() => ({
    filters: submittedFilters() ?? defaultStatusFilters(),
    page: page(),
    pageSize,
    sort: "order_date",
    order: "desc",
    enabled: submittedFilters() !== null,
  }));

  return (
    <SalesLayout>
      <SalesStatusFilter
        title="Sales Discount Status"
        subtitle="Lines with discount amount greater than zero — Search (F8)."
        value={draftFilters}
        onChange={setDraftFilters}
        onSearch={() => { setSubmittedFilters({ ...draftFilters() }); setPage(1); setGeneratedAt(new Date()); }}
        onReset={() => { setDraftFilters(defaultStatusFilters()); setSubmittedFilters(null); setPage(1); }}
      />
      <Show when={submittedFilters()}>
        <SalesDiscountStatusReport
          filters={submittedFilters()!}
          rows={report.data?.rows ?? []}
          totalQty={report.data?.summary.total_qty ?? 0}
          totalDiscount={report.data?.summary.total_discount_amount ?? 0}
          totalAmount={report.data?.summary.total_amount ?? 0}
          totalRows={report.data?.total ?? 0}
          page={page()}
          pageSize={pageSize}
          loading={report.isFetching}
          generatedAt={generatedAt}
          onPageChange={setPage}
        />
      </Show>
    </SalesLayout>
  );
}
