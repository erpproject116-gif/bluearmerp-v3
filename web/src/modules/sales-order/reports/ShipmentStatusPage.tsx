import { createSignal, For, onMount, Show } from "solid-js";
import { defaultReportDateRange, ReportPageLayout } from "../../../shared/reports/ReportPageLayout";
import { downloadReportCsv } from "../../../shared/reports/downloadReportCsv";
import {
  shipmentStatusExportUrl,
  useShipmentStatusReport,
  type ShippingReportFilters,
} from "../../../shared/useShippingReports";
import { SalesOrderLayout } from "../SalesOrderLayout";

export default function ShipmentStatusPage() {
  const defaults = defaultReportDateRange();
  const [submitted, setSubmitted] = createSignal(false);
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const [filters, setFilters] = createSignal<ShippingReportFilters>(defaults);
  const pageSize = 50;

  const report = useShipmentStatusReport(() => ({
    filters: filters(),
    page: page(),
    pageSize,
    sort: "shipping_date",
    order: "desc",
    enabled: submitted(),
  }));

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F8") {
        e.preventDefault();
        search();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const search = () => {
    setSubmitted(true);
    setPage(1);
    setGeneratedAt(new Date());
  };

  const totalPages = () => Math.max(1, Math.ceil((report.data?.total ?? 0) / pageSize));

  return (
    <SalesOrderLayout>
      <ReportPageLayout
        title="Shipment Status"
        description="Shipped lines by shipping order — Search (F8)."
        dateFrom={() => filters().date_from ?? ""}
        dateTo={() => filters().date_to ?? ""}
        onDateFromChange={(v) => setFilters((f) => ({ ...f, date_from: v }))}
        onDateToChange={(v) => setFilters((f) => ({ ...f, date_to: v }))}
        submitted={submitted()}
        loading={report.isFetching}
        generatedAt={generatedAt()}
        page={page()}
        totalPages={totalPages()}
        onPageChange={setPage}
        onSearch={search}
        onReset={() => {
          setFilters(defaults);
          setSubmitted(false);
          setPage(1);
        }}
        onExportCsv={() => void downloadReportCsv(shipmentStatusExportUrl(filters()), "shipment-status.csv")}
      >
        <table class="erp-grid min-w-full text-left text-sm">
          <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
            <tr>
              <th class="px-3 py-2">Shipping Date</th>
              <th class="px-3 py-2">Shipping No.</th>
              <th class="px-3 py-2">Status</th>
              <th class="px-3 py-2">Customer</th>
              <th class="px-3 py-2">Location</th>
              <th class="px-3 py-2">SO No.</th>
              <th class="px-3 py-2">Item Code</th>
              <th class="px-3 py-2">Item Name</th>
              <th class="px-3 py-2 text-right">Qty</th>
              <th class="px-3 py-2">Carrier</th>
            </tr>
          </thead>
          <tbody>
            <For each={report.data?.rows ?? []}>
              {(row) => (
                <tr class="border-t border-stroke/60">
                  <td class="px-3 py-2">{row.shipping_date}</td>
                  <td class="px-3 py-2">{row.shipping_no}</td>
                  <td class="px-3 py-2">{row.status}</td>
                  <td class="px-3 py-2">{row.customer_name}</td>
                  <td class="px-3 py-2">{row.location_name}</td>
                  <td class="px-3 py-2">{row.sales_order_no}</td>
                  <td class="px-3 py-2">{row.item_code}</td>
                  <td class="px-3 py-2">{row.item_name}</td>
                  <td class="px-3 py-2 text-right">{row.qty}</td>
                  <td class="px-3 py-2">{row.carrier ?? ""}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
        <Show when={submitted() && (report.data?.rows?.length ?? 0) === 0 && !report.isFetching}>
          <p class="px-5 py-8 text-center text-sm text-text-secondary">No shipments in this date range.</p>
        </Show>
      </ReportPageLayout>
    </SalesOrderLayout>
  );
}
