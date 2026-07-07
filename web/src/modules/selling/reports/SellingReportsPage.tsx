import { A } from "@solidjs/router";
import { createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { useToast } from "../../../shared/toast";
import {
  patchSalesProgressFromReport,
  useInvalidateSalesStatusReport,
  useSalesStatusReport,
} from "../../../shared/useSalesStatusReport";
import { ReportTypeTabs, type ReportType } from "../../../shared/reports/ReportTypeTabs";
import { SalesModal, type SalesDetail } from "../../sales/sales/SalesModal";
import { SalesStatusFilter } from "../../sales/sales/SalesStatusFilter";
import { SalesStatusReport } from "../../sales/sales/SalesStatusReport";
import { defaultStatusFilters, type SalesStatusFilters } from "../../sales/sales/salesStatusFilters";
import type { SalesTemplateCode } from "../../sales/sales/SalesLineGrid";

const reportLinks = [
  { label: "A/R by Customer", href: "/app/sales/reports/ar-by-customer" },
  { label: "Receipt Status", href: "/app/finance/reports/receipt-status" },
  { label: "Receivable Status", href: "/app/selling/reports/receivable-status" },
  { label: "SO Analysis", href: "/app/sales-order/reports/so-analysis" },
];

export default function SellingReportsPage() {
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

  const patch = (p: Partial<SalesStatusFilters>) => setDraftFilters((prev) => ({ ...prev, ...p }));

  const openSales = async (salesId: number) => {
    const res = await apiFetch<SalesDetail>(`/api/v1/sales/${salesId}`);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? "Failed to load sales.");
      return;
    }
    setEditing(res.data);
    setModalOpen(true);
  };

  const editingTemplate = (): SalesTemplateCode =>
    (editing()?.template_code ?? "default") as SalesTemplateCode;

  return (
    <div class="space-y-6">
      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <h2 class="text-lg font-semibold text-text-primary">Selling reports</h2>
        <ul class="mt-3 flex flex-wrap gap-3 text-sm">
          <For each={reportLinks}>
            {(link) => (
              <li>
                <A href={link.href} class="font-medium text-brand-600 hover:underline">{link.label}</A>
              </li>
            )}
          </For>
        </ul>
      </section>

      <SalesStatusFilter
        title="Sales Status"
        subtitle="Details · Summary · by Line — set filters, then Search (F8)."
        value={draftFilters}
        onChange={setDraftFilters}
        onSearch={search}
        onReset={reset}
      />
      <ReportTypeTabs
        value={() => draftFilters().report_type ?? "details"}
        onChange={(t: ReportType) => patch({ report_type: t })}
      />

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
          onProgressChange={async (id, status) => {
            const res = await patchSalesProgressFromReport(id, status);
            if (!res.success) toast.warning(res.message ?? "Failed to update progress.");
            else invalidate();
          }}
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
    </div>
  );
}
