import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import { BiReportCard } from "../../dashboard/BiReportCard";
import { defaultReportDateRange, ReportPageLayout } from "../../../shared/reports/ReportPageLayout";
import { downloadReportCsv } from "../../../shared/reports/downloadReportCsv";
import {
  fulfillmentProgressExportUrl,
  useFulfillmentProgressReport,
  type DateRangeFilters,
} from "../../../shared/reports/useModuleReports";
import { formatMoney } from "../../../shared/money";
import type { GridExportColumn } from "../../../shared/gridExport";
import { SalesOrderLayout } from "../SalesOrderLayout";

const deliveryCols: GridExportColumn[] = [
  { key: "label", header: "Delivery status", value: (r: Record<string, unknown>) => String(r.label ?? "") },
  { key: "count", header: "Orders", value: (r: Record<string, unknown>) => Number(r.count ?? 0) },
];

const billingCols: GridExportColumn[] = [
  { key: "label", header: "Billing status", value: (r: Record<string, unknown>) => String(r.label ?? "") },
  { key: "count", header: "Orders", value: (r: Record<string, unknown>) => Number(r.count ?? 0) },
];

export default function FulfillmentProgressReportPage() {
  const defaults = defaultReportDateRange();
  const [submitted, setSubmitted] = createSignal(true);
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const [filters, setFilters] = createSignal<DateRangeFilters>(defaults);
  const [pageSize, setPageSize] = createSignal(50);

  const report = useFulfillmentProgressReport(() => ({
    filters: filters(),
    page: page(),
    pageSize: pageSize(),
    sort: "order_date",
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

  const totalPages = () => Math.max(1, Math.ceil((report.data?.total ?? 0) / pageSize()));

  const deliveryChart = createMemo(() => {
    const s = report.data?.summary;
    if (!s) return { labels: [] as string[], values: [] as number[], rows: [] as Record<string, unknown>[] };
    const labels = ["Fully delivered", "Partially delivered", "Not delivered"];
    const values = [s.fully_delivered, s.partially_delivered, s.not_delivered];
    return { labels, values, rows: labels.map((label, i) => ({ label, count: values[i] ?? 0 })) };
  });

  const billingChart = createMemo(() => {
    const s = report.data?.summary;
    if (!s) return { labels: [] as string[], values: [] as number[], rows: [] as Record<string, unknown>[] };
    const labels = ["Fully billed", "Partially billed", "Not billed"];
    const values = [s.fully_billed, s.partially_billed, s.not_billed];
    return { labels, values, rows: labels.map((label, i) => ({ label, count: values[i] ?? 0 })) };
  });

  const asOf = () => generatedAt().toLocaleString();

  return (
    <SalesOrderLayout>
      <ReportPageLayout
        title="Fulfillment Progress"
        description="Delivery and billing completion by sales order — Search (F8)."
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
      pageSize={pageSize()} onPageSizeChange={setPageSize}
        onSearch={search}
        onReset={() => {
          setFilters(defaults);
          setSubmitted(true);
          setPage(1);
        }}
        onExportCsv={() => void downloadReportCsv(fulfillmentProgressExportUrl(filters()), "fulfillment-progress.csv")}
        exportFilename="fulfillment-progress"
      >
        <Show when={submitted() && report.data}>
          <div class="grid gap-4 pb-6 lg:grid-cols-2">
            <BiReportCard
              id="fulfillment-delivery"
              title="Delivery completion"
              asOf={asOf()}
              type="doughnut"
              labels={deliveryChart().labels}
              values={deliveryChart().values}
              valueFormat="int"
              columns={deliveryCols}
              rows={deliveryChart().rows}
              emptyText="No sales orders in this date range."
            />
            <BiReportCard
              id="fulfillment-billing"
              title="Billing completion"
              asOf={asOf()}
              type="doughnut"
              labels={billingChart().labels}
              values={billingChart().values}
              valueFormat="int"
              columns={billingCols}
              rows={billingChart().rows}
              emptyText="No sales orders in this date range."
            />
          </div>
        </Show>
        <table class="erp-grid min-w-full text-left text-sm">
          <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
            <tr>
              <th class="px-3 py-2">SO No.</th>
              <th class="px-3 py-2">Order Date</th>
              <th class="px-3 py-2">Customer</th>
              <th class="px-3 py-2">Progress</th>
              <th class="px-3 py-2 text-right">% Delivered</th>
              <th class="px-3 py-2 text-right">% Billed</th>
              <th class="px-3 py-2 text-right">Grand Total</th>
            </tr>
          </thead>
          <tbody>
            <For each={report.data?.rows ?? []}>
              {(row) => (
                <tr class="border-t border-stroke/60">
                  <td class="px-3 py-2">{row.sales_order_no}</td>
                  <td class="px-3 py-2">{row.order_date}</td>
                  <td class="px-3 py-2">{row.customer_name}</td>
                  <td class="px-3 py-2">{row.progress_status}</td>
                  <td class="px-3 py-2 text-right">{row.pct_delivered}%</td>
                  <td class="px-3 py-2 text-right">{row.pct_billed}%</td>
                  <td class="px-3 py-2 text-right">{formatMoney(row.grand_total)}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
        <Show when={submitted() && (report.data?.rows?.length ?? 0) === 0 && !report.isFetching}>
          <p class="px-5 py-8 text-center text-sm text-text-secondary">No sales orders in this date range.</p>
        </Show>
      </ReportPageLayout>
    </SalesOrderLayout>
  );
}
