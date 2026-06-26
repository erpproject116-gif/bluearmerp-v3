import { createEffect, createResource, For, Show } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { ProtectedRoute } from "../../../shared/ProtectedRoute";
import { apiFetch } from "../../../shared/api";
import { defaultStatusFilters, filtersToSearchParams, type SalesStatusFilters } from "../sales/salesStatusFilters";
import type { SalesStatusReportRow } from "../../../shared/useSalesStatusReport";
import { formatMoney, formatPrintDate, partyContact, type SalesPrintPayload } from "../sales/salesPrint";
import { PrintBrandingHeader } from "../../../shared/branding/PrintBrandingHeader";
import { PrintBrandingFooter } from "../../../shared/branding/PrintBrandingFooter";
import { PrintPreviewTable, type PrintPreviewColumn } from "../../../shared/PrintPreviewTable";
import "../../quotation/quotation/quotationPrint.css";

type SaleLine = {
  line_no?: number;
  item_code: string;
  item_name: string;
  qty: number;
  line_total: number;
};

const slipColumns: PrintPreviewColumn<SaleLine>[] = [
  { key: "item", header: "Item", render: (ln) => `${ln.item_code} — ${ln.item_name}` },
  { key: "qty", header: "Qty", align: "right", render: (ln) => ln.qty },
  { key: "total", header: "Line Total", align: "right", render: (ln) => formatMoney(ln.line_total) },
];

function parseFilters(params: Record<string, string | string[]>): SalesStatusFilters {
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
  };
}

async function fetchDistinctSalesIds(filters: SalesStatusFilters) {
  const ids = new Set<number>();
  let page = 1;
  while (page <= 50) {
    const qs = filtersToSearchParams(filters, { page, pageSize: 100, sort: "order_date", order: "desc" });
    const res = await apiFetch<{ rows: SalesStatusReportRow[] }>(`/api/v1/sales/status-report?${qs}`);
    if (!res.success || !res.data) break;
    for (const row of res.data.rows ?? []) ids.add(row.sales_id);
    const total = res.meta?.total ?? 0;
    if (page * 100 >= total) break;
    page++;
  }
  return [...ids];
}

async function fetchPrintBatch(ids: number[]) {
  if (!ids.length) return [] as SalesPrintPayload[];
  const res = await apiFetch<SalesPrintPayload[]>(`/api/v1/sales/print-batch?ids=${ids.join(",")}`);
  if (!res.success || !res.data) throw new Error(res.message ?? "Failed to load print batch");
  return res.data;
}

function SlipDocument(props: { payload: SalesPrintPayload }) {
  const sale = () => props.payload.sales;
  const lines = () => (sale().lines ?? []) as SaleLine[];
  return (
    <article class="quotation-print__page print:break-after-page">
      <PrintBrandingHeader
        docTitle="PACKING SLIP"
        tenantFallbackName={props.payload.tenant.company_name}
      />
      <section class="quotation-print__grid">
        <div>
          <h3 class="quotation-print__section">Bill To</h3>
          <p>{props.payload.partner.company_name}</p>
          <p class="quotation-print__meta">{partyContact(props.payload.partner)}</p>
        </div>
        <div>
          <h3 class="quotation-print__section">Receipt Details</h3>
          <p>{sale().date_no_display} · {sale().sales_no}</p>
          <p class="quotation-print__meta">Date: {formatPrintDate(sale().order_date)}</p>
        </div>
      </section>
      <PrintPreviewTable columns={slipColumns} rows={lines()} />
      <p class="mt-4 text-right font-semibold">Grand Total: {formatMoney(sale().grand_total)}</p>
      <PrintBrandingFooter />
    </article>
  );
}

function PrintView() {
  const [params] = useSearchParams();
  const filters = () => parseFilters(params as Record<string, string | string[]>);
  const [data] = createResource(filters, async (f) => {
    const ids = await fetchDistinctSalesIds(f);
    return fetchPrintBatch(ids);
  });

  createEffect(() => {
    if (!data()) return;
    const timer = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(timer);
  });

  return (
    <div class="quotation-print">
      <Show when={data.loading}><p class="quotation-print__loading">Loading slips…</p></Show>
      <Show when={data.error}><p class="quotation-print__error">{String(data.error)}</p></Show>
      <Show when={!data.loading && data()?.length === 0}><p>No sales match the current filters.</p></Show>
      <For each={data() ?? []}>{(payload) => <SlipDocument payload={payload} />}</For>
    </div>
  );
}

export default function SalesSlipsPrintPage() {
  return (
    <ProtectedRoute>
      <PrintView />
    </ProtectedRoute>
  );
}
