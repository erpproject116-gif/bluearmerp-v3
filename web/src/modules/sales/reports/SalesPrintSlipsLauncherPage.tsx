import { createSignal } from "solid-js";
import { SalesStatusFilter } from "../sales/SalesStatusFilter";
import { defaultStatusFilters, filtersToSearchParams, type SalesStatusFilters } from "../sales/salesStatusFilters";
import { SalesLayout } from "../SalesLayout";

export default function SalesPrintSlipsLauncherPage() {
  const [filters, setFilters] = createSignal<SalesStatusFilters>(defaultStatusFilters());

  const openPrint = () => {
    const qs = filtersToSearchParams(filters()).toString();
    window.open(`/app/sales/reports/print-slips/print?${qs}`, "_blank", "noopener,noreferrer");
  };

  return (
    <SalesLayout>
      <SalesStatusFilter
        title="Print Sales Slips"
        subtitle="Use the same filters as Sales Status, then open a batch print preview."
        value={filters}
        onChange={setFilters}
        onSearch={openPrint}
        onReset={() => setFilters(defaultStatusFilters())}
      />
      <section class="mt-4 rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <p class="text-sm text-text-secondary">
          Click Search (F8) to open a print preview for all sales invoices matching the filter (one packing slip per sales invoice).
        </p>
        <button type="button" class="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700" onClick={openPrint}>
          Open Print Preview
        </button>
      </section>
    </SalesLayout>
  );
}
