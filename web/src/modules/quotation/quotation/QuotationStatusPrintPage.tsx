import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { ProtectedRoute } from "../../../shared/ProtectedRoute";
import { apiFetch } from "../../../shared/api";
import {
  defaultStatusFilters,
  filtersToSearchParams,
  formatDisplayDate,
  type QuotationStatusFilters,
} from "./quotationStatusFilters";
import type { QuotationStatusReportRow } from "../../../shared/useQuotationStatusReport";
import { progressStatusLabel } from "./progressStatus";
import { PrintBrandingHeader } from "../../../shared/branding/PrintBrandingHeader";
import { PrintBrandingFooter } from "../../../shared/branding/PrintBrandingFooter";
import "./quotationPrint.css";

function parseFiltersFromSearch(params: Record<string, string | string[]>): QuotationStatusFilters {
  const get = (k: string) => {
    const v = params[k];
    return typeof v === "string" ? v : "";
  };
  const num = (k: string) => {
    const v = get(k);
    const n = Number(v);
    return v && Number.isFinite(n) ? n : null;
  };
  const base = defaultStatusFilters();
  return {
    date_from: get("date_from") || base.date_from,
    date_to: get("date_to") || base.date_to,
    location_id: num("location_id"),
    project_id: num("project_id"),
    pic_user_id: num("pic_user_id"),
    partner_id: num("partner_id"),
    item_id: num("item_id"),
    tax_type_id: num("tax_type_id"),
    progress_status: get("progress_status") || undefined,
    validity: get("validity") || base.validity,
  };
}

async function fetchAllStatusRows(filters: QuotationStatusFilters) {
  const rows: QuotationStatusReportRow[] = [];
  let totalQty = 0;
  let totalAmount = 0;
  let page = 1;
  const pageSize = 100;
  while (page <= 50) {
    const qs = filtersToSearchParams(filters, { page, pageSize, sort: "order_date", order: "desc" });
    const res = await apiFetch<{ rows: QuotationStatusReportRow[]; summary: { total_qty: number; total_amount: number } }>(
      `/api/v1/quotation/quotations/status-report?${qs}`,
    );
    if (!res.success || !res.data) throw new Error(res.message ?? "Failed to load report");
    rows.push(...(res.data.rows ?? []));
    totalQty = res.data.summary?.total_qty ?? totalQty;
    totalAmount = res.data.summary?.total_amount ?? totalAmount;
    const total = res.meta?.total ?? 0;
    if (rows.length >= total) break;
    page++;
  }
  return { rows, totalQty, totalAmount };
}

function money(n: number) {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatusPrintView() {
  const [params] = useSearchParams();
  const [generatedAt] = createSignal(new Date());
  const filters = () => parseFiltersFromSearch(params as Record<string, string | string[]>);
  const [data] = createResource(filters, fetchAllStatusRows);

  createEffect(() => {
    if (!data()) return;
    const timer = window.setTimeout(() => window.print(), 350);
    return () => window.clearTimeout(timer);
  });

  return (
    <div class="quotation-print">
      <Show when={data.loading}>
        <p class="quotation-print__loading">Loading…</p>
      </Show>
      <Show when={data.error}>
        <p class="quotation-print__error">{String(data.error)}</p>
      </Show>
      <Show when={data()}>
        {(payload) => (
          <article class="quotation-print__page">
            <PrintBrandingHeader
              docTitle="Quotation Status"
              docSubtitle={`${formatDisplayDate(filters().date_from)} ~ ${formatDisplayDate(filters().date_to)}`}
            />
            <table class="quotation-print__table">
              <thead>
                <tr>
                  <th>Date-No.</th>
                  <th>Reference</th>
                  <th>Progress</th>
                  <th>Location</th>
                  <th>PIC</th>
                  <th>Customer</th>
                  <th>Tax Type</th>
                  <th>Item Code</th>
                  <th>Item Name</th>
                  <th class="num">Qty</th>
                  <th class="num">Line Total</th>
                </tr>
              </thead>
              <tbody>
                <For each={payload().rows}>
                  {(row) => (
                    <tr>
                      <td>{row.date_no_display}</td>
                      <td>{row.reference_no}</td>
                      <td>{progressStatusLabel(row.progress_status)}</td>
                      <td>{row.location_name}</td>
                      <td>{row.pic_name}</td>
                      <td>{row.customer_name}</td>
                      <td>{row.tax_type_name}</td>
                      <td>{row.item_code}</td>
                      <td>{row.item_name}</td>
                      <td class="num">{row.qty}</td>
                      <td class="num">{money(row.line_total)}</td>
                    </tr>
                  )}
                </For>
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={9} class="quotation-print__totals-row">
                    Total
                  </td>
                  <td class="num">{payload().totalQty}</td>
                  <td class="num">{money(payload().totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
            <PrintBrandingFooter
              class="quotation-print__footer"
              defaultFooter={`[P.1] · ${generatedAt().toLocaleString()}`}
            />
          </article>
        )}
      </Show>
      <div class="quotation-print__toolbar no-print">
        <button type="button" class="quotation-print__btn" onClick={() => window.print()}>
          Print
        </button>
        <button type="button" class="quotation-print__btn quotation-print__btn--muted" onClick={() => window.close()}>
          Close
        </button>
      </div>
    </div>
  );
}

export default function QuotationStatusPrintPage() {
  return (
    <ProtectedRoute>
      <StatusPrintView />
    </ProtectedRoute>
  );
}
