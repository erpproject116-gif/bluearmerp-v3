import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import { formatPeso } from "../../../shared/money";
import { useSearchParams } from "@solidjs/router";
import { ProtectedRoute } from "../../../shared/ProtectedRoute";
import { apiFetch } from "../../../shared/api";
import { PrintBrandingHeader } from "../../../shared/branding/PrintBrandingHeader";
import { PrintBrandingFooter } from "../../../shared/branding/PrintBrandingFooter";
import { PrintPageSettingsModal } from "../../../shared/PrintPageSettingsModal";
import { applyPrintPageSettings, loadPrintPageSettings } from "../../../shared/printPageSettings";
import type { CollectiveInvoiceStatusRow } from "../../../shared/useCollectiveInvoiceStatusReport";
import { buildInvoiceReportLines } from "./invoiceStatusGrouping";
import {
  filtersToSearchParams,
  formatDisplayDate,
  parseCollectiveInvoiceStatusFiltersFromSearch,
  type CollectiveInvoiceStatusFilters,
} from "./collectiveInvoiceStatusFilters";
import { parseTemplateFromSearch } from "./collectiveInvoiceStatusTemplate";
import "../../quotation/quotation/quotationPrint.css";



async function fetchAllRows(filters: CollectiveInvoiceStatusFilters, template: ReturnType<typeof parseTemplateFromSearch>) {
  const rows: CollectiveInvoiceStatusRow[] = [];
  let summary = { total_pretax: 0, total_tax: 0, total_sales: 0 };
  let page = 1;
  const pageSize = 100;
  while (page <= 100) {
    const qs = filtersToSearchParams(filters, {
      page,
      pageSize,
      sort: template.sortField,
      order: template.sortOrder,
      sort2: template.sortField2 || undefined,
      order2: template.sortField2 ? template.sortOrder2 : undefined,
    });
    const res = await apiFetch<{
      rows: CollectiveInvoiceStatusRow[];
      summary: typeof summary;
    }>(`/api/v1/sales/collective-invoice-status-report?${qs}`);
    if (!res.success || !res.data) throw new Error(res.message ?? "Failed to load report");
    rows.push(...(res.data.rows ?? []));
    summary = res.data.summary ?? summary;
    const total = res.meta?.total ?? 0;
    if (rows.length >= total) break;
    page++;
  }
  return { rows, summary };
}

function PrintView() {
  const [params] = useSearchParams();
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [autoPrinted, setAutoPrinted] = createSignal(false);
  const filters = () => parseCollectiveInvoiceStatusFiltersFromSearch(params as Record<string, string | string[]>);
  const template = () => parseTemplateFromSearch(params as Record<string, string | string[]>);
  const [data] = createResource(
    () => ({ filters: filters(), template: template() }),
    ({ filters: f, template: t }) => fetchAllRows(f, t),
  );

  createEffect(() => {
    applyPrintPageSettings(loadPrintPageSettings());
  });

  createEffect(() => {
    if (!data() || autoPrinted()) return;
    setAutoPrinted(true);
    const timer = window.setTimeout(() => window.print(), 500);
    return () => window.clearTimeout(timer);
  });

  const reportLines = () => buildInvoiceReportLines(data()?.rows ?? [], template().subtotalBy);
  const pages = () => {
    const lines = reportLines();
    const chunks: typeof lines[] = [];
    let chunk: typeof lines = [];
    for (const line of lines) {
      chunk.push(line);
      if (line.kind === "subtotal" && chunk.length > 25) {
        chunks.push(chunk);
        chunk = [];
      }
    }
    if (chunk.length) chunks.push(chunk);
    return chunks.length ? chunks : [lines];
  };

  return (
    <div class="quotation-print">
      <div class="no-print mb-4 flex gap-2 p-4">
        <button type="button" class="rounded-lg border border-stroke px-3 py-1.5 text-sm" onClick={() => setSettingsOpen(true)}>
          Page Settings
        </button>
        <button type="button" class="rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white" onClick={() => window.print()}>
          Print
        </button>
      </div>
      <PrintPageSettingsModal
        open={settingsOpen()}
        onClose={() => setSettingsOpen(false)}
        onConfirm={(s) => applyPrintPageSettings(s)}
      />
      <Show when={data.loading}><p class="quotation-print__loading">Loading…</p></Show>
      <Show when={data.error}><p class="quotation-print__error">{String(data.error)}</p></Show>
      <Show when={data()}>
        {(payload) => (
          <For each={pages()}>
            {(pageLines, pageIndex) => (
              <article class="quotation-print__page" style={{ "break-after": "page" }}>
                <PrintBrandingHeader
                  docTitle="Sales Invoice Status"
                  docSubtitle={`${formatDisplayDate(filters().date_from)} ~ ${formatDisplayDate(filters().date_to)}`}
                  overrides={{
                    printHeader: template().printHeader,
                    printFooter: template().printFooter,
                    logoAssetId: template().logoAssetId,
                  }}
                />
                <table class="quotation-print__table w-full text-sm">
                  <thead>
                    <tr>
                      <th>Date-No.</th>
                      <th>Receivable No.</th>
                      <th>Customer</th>
                      <th class="text-right">Pretax</th>
                      <th class="text-right">Tax</th>
                      <th class="text-right">Total</th>
                      <th>Due Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={pageLines}>
                      {(line) => {
                        if (line.kind === "group") {
                          return <tr><td colSpan={7}><strong>{line.label}</strong></td></tr>;
                        }
                        if (line.kind === "subtotal") {
                          return (
                            <tr>
                              <td colSpan={3}><strong>{line.label}</strong></td>
                              <td class="text-right"><strong>{formatPeso(line.pretax_amount)}</strong></td>
                              <td class="text-right"><strong>{formatPeso(line.sales_tax)}</strong></td>
                              <td class="text-right"><strong>{formatPeso(line.total_sales)}</strong></td>
                              <td />
                            </tr>
                          );
                        }
                        const row = line.row;
                        return (
                          <tr>
                            <td>{row.date_no_display}</td>
                            <td>{row.receivable_no}</td>
                            <td>{row.customer_name}</td>
                            <td class="text-right">{formatPeso(row.pretax_amount)}</td>
                            <td class="text-right">{formatPeso(row.sales_tax)}</td>
                            <td class="text-right">{formatPeso(row.total_sales)}</td>
                            <td>{row.due_date ?? ""}</td>
                          </tr>
                        );
                      }}
                    </For>
                  </tbody>
                  <Show when={pageIndex() === pages().length - 1}>
                    <tfoot>
                      <tr>
                        <td colSpan={3}><strong>Total</strong></td>
                        <td class="text-right"><strong>{formatPeso(payload().summary.total_pretax)}</strong></td>
                        <td class="text-right"><strong>{formatPeso(payload().summary.total_tax)}</strong></td>
                        <td class="text-right"><strong>{formatPeso(payload().summary.total_sales)}</strong></td>
                        <td />
                      </tr>
                    </tfoot>
                  </Show>
                </table>
                <PrintBrandingFooter overrides={{ printFooter: template().printFooter }} />
                <p class="mt-4 text-xs text-text-secondary">[P.{pageIndex() + 1}]</p>
              </article>
            )}
          </For>
        )}
      </Show>
    </div>
  );
}

export default function CollectiveInvoiceStatusPrintPage() {
  return (
    <ProtectedRoute>
      <PrintView />
    </ProtectedRoute>
  );
}
