import { createEffect, createResource, createSignal, For, onCleanup, Show } from "solid-js";
import { fetchReportLogoBlob } from "../../../shared/reportTemplates/useReportTemplates";
import { fetchBrandingLogoBlob, useBranding } from "../../../shared/branding/BrandingProvider";
import {
  resolveLogoAssetId,
  resolvePrintCompanyName,
  resolvePrintFooterText,
  resolvePrintHeaderText,
} from "../../../shared/branding/receiptBranding";
import {
  DISCOUNT_STATUS_COLUMNS,
  showDiscountColumn,
  type DiscountColumnKey,
} from "./discountStatusColumns";
import { useSearchParams } from "@solidjs/router";
import { ProtectedRoute } from "../../../shared/ProtectedRoute";
import { useAuth } from "../../../shared/auth-context";
import { apiFetch } from "../../../shared/api";
import { PrintPageSettingsModal } from "../../../shared/PrintPageSettingsModal";
import { applyPrintPageSettings, loadPrintPageSettings } from "../../../shared/printPageSettings";
import type { SalesDiscountStatusRow } from "../../../shared/useSalesDiscountStatusReport";
import { buildDiscountReportLines } from "./discountStatusGrouping";
import { DiscountReportTableRow } from "./DiscountReportTableRow";
import { SalesDiscountStatusGraph } from "./SalesDiscountStatusGraph";
import {
  filtersToSearchParams,
  formatDisplayDate,
  parseDiscountStatusFiltersFromSearch,
  type SalesDiscountStatusFilters,
} from "./salesDiscountStatusFilters";
import { parseTemplateFromSearch } from "./salesDiscountStatusTemplate";
import "../../quotation/quotation/quotationPrint.css";

function money(n: number) {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function fetchAllRows(filters: SalesDiscountStatusFilters, template: ReturnType<typeof parseTemplateFromSearch>) {
  const rows: SalesDiscountStatusRow[] = [];
  let summary = { total_sales_amount: 0, total_invoicing_amount: 0, total_difference_amount: 0 };
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
      rows: SalesDiscountStatusRow[];
      summary: typeof summary;
    }>(`/api/v1/sales/discount-status-report?${qs}`);
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
  const auth = useAuth();
  const branding = useBranding();
  const [params] = useSearchParams();
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [autoPrinted, setAutoPrinted] = createSignal(false);
  const filters = () => parseDiscountStatusFiltersFromSearch(params as Record<string, string | string[]>);
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

  const [logoUrl, setLogoUrl] = createSignal<string | null>(null);

  createEffect(() => {
    const tpl = template();
    const logoId = resolveLogoAssetId(tpl.logoAssetId, branding.settings());
    if (!logoId) {
      setLogoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }
    const fetcher = tpl.logoAssetId ? fetchReportLogoBlob : fetchBrandingLogoBlob;
    void fetcher(logoId).then(setLogoUrl);
  });

  const companyName = () =>
    resolvePrintCompanyName(undefined, branding.settings(), auth.me?.tenant.company_name);
  const printHeader = () => resolvePrintHeaderText(template().printHeader, branding.settings());
  const printFooter = () => resolvePrintFooterText(template().printFooter, branding.settings());

  onCleanup(() => {
    const url = logoUrl();
    if (url) URL.revokeObjectURL(url);
  });

  const showCol = (key: DiscountColumnKey) =>
    showDiscountColumn(key, template().columnVisibility, template().displayApvlLine);
  const labelColspan = () => [showCol("order_date"), showCol("customer_name")].filter(Boolean).length || 1;

  const reportLines = () => buildDiscountReportLines(data()?.rows ?? [], template().subtotalBy);

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
      <Show when={data.loading}>
        <p class="quotation-print__loading">Loading…</p>
      </Show>
      <Show when={data.error}>
        <p class="quotation-print__error">{String(data.error)}</p>
      </Show>
      <Show when={data()}>
        {(payload) => (
          <article class="quotation-print__page">
            <header class="quotation-print__header">
              <div>
                <Show when={logoUrl()}>
                  <img src={logoUrl()!} alt="Logo" class="mb-2 max-h-16 max-w-[10rem] object-contain" />
                </Show>
                <h1 class="quotation-print__company">{companyName()}</h1>
                <Show when={printHeader().trim()}>
                  <p class="quotation-print__meta whitespace-pre-line">{printHeader()}</p>
                </Show>
              </div>
              <div class="quotation-print__doc-title">
                <h2>Sales Discount Status</h2>
                <p class="quotation-print__meta">
                  {formatDisplayDate(filters().date_from)} ~ {formatDisplayDate(filters().date_to)}
                </p>
              </div>
            </header>
            <Show when={template().viewAsGraph}>
              <SalesDiscountStatusGraph rows={payload().rows} metric="difference_amount" />
            </Show>
            <Show when={!template().viewAsGraph}>
              <table class="quotation-print__table w-full text-sm">
                <thead>
                  <tr>
                    <For each={DISCOUNT_STATUS_COLUMNS}>
                      {(col) => (
                        <Show when={showCol(col.key as DiscountColumnKey)}>
                          <th class={col.align === "right" ? "text-right" : ""}>{col.label}</th>
                        </Show>
                      )}
                    </For>
                  </tr>
                </thead>
                <tbody>
                  <For each={reportLines()}>
                    {(line) => (
                      <DiscountReportTableRow
                        line={line}
                        displayApvlLine={template().displayApvlLine}
                        columnVisibility={template().columnVisibility}
                        money={money}
                        variant="print"
                      />
                    )}
                  </For>
                </tbody>
                <tfoot>
                  <tr>
                    <Show when={showCol("order_date") || showCol("customer_name")}>
                      <td colSpan={labelColspan()}><strong>Total</strong></td>
                    </Show>
                    <Show when={showCol("sales_amount")}><td class="text-right"><strong>{money(payload().summary.total_sales_amount)}</strong></td></Show>
                    <Show when={showCol("invoicing_amount")}><td class="text-right"><strong>{money(payload().summary.total_invoicing_amount)}</strong></td></Show>
                    <Show when={showCol("difference_amount")}><td class="text-right"><strong>{money(payload().summary.total_difference_amount)}</strong></td></Show>
                    <Show when={showCol("apvl_line")}><td /></Show>
                    <Show when={showCol("remark")}><td /></Show>
                  </tr>
                </tfoot>
              </table>
            </Show>
            <Show when={printFooter().trim()}>
              <footer class="mt-6 border-t border-stroke pt-3 text-center text-sm text-text-secondary whitespace-pre-line">
                {printFooter()}
              </footer>
            </Show>
          </article>
        )}
      </Show>
    </div>
  );
}

export default function SalesDiscountStatusPrintPage() {
  return (
    <ProtectedRoute>
      <PrintView />
    </ProtectedRoute>
  );
}
