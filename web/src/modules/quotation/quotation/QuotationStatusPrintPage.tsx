import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import { formatPeso } from "../../../shared/money";
import { useSearchParams } from "@solidjs/router";
import { ProtectedRoute } from "../../../shared/ProtectedRoute";
import { apiFetch } from "../../../shared/api";
import { fetchAllPaginatedPages } from "../../../shared/fetchAllPaginated";
import { StatusReportPrintDocument, type StatusPrintColumn } from "../../../shared/statusReportPrint";
import type { QuotationStatusReportRow } from "../../../shared/useQuotationStatusReport";
import {
  defaultStatusFilters,
  filtersToSearchParams,
  formatDisplayDate,
  type QuotationStatusFilters,
} from "./quotationStatusFilters";
import { progressStatusLabel } from "./progressStatus";
import "./quotationPrint.css";

const QUOTE_STATUS_PRINT_COLUMNS_META = [
  { key: "date_no_display", label: "Date-No." },
  { key: "reference_no", label: "Reference" },
  { key: "progress_status", label: "Progress" },
  { key: "location_name", label: "Location" },
  { key: "pic_name", label: "PIC" },
  { key: "customer_name", label: "Customer" },
  { key: "tax_type_name", label: "Tax Type" },
  { key: "item_code", label: "Item Code" },
  { key: "item_name", label: "Item Name" },
  { key: "qty", label: "Qty" },
  { key: "line_total", label: "Line Total" },
] as const;



function quotationStatusPrintColumns(): StatusPrintColumn<QuotationStatusReportRow>[] {
  return [
    { key: "date_no_display", label: "Date-No.", render: (r) => r.date_no_display },
    { key: "reference_no", label: "Reference", render: (r) => r.reference_no },
    { key: "progress_status", label: "Progress", render: (r) => progressStatusLabel(r.progress_status) },
    { key: "location_name", label: "Location", render: (r) => r.location_name },
    { key: "pic_name", label: "PIC", render: (r) => r.pic_name },
    { key: "customer_name", label: "Customer", render: (r) => r.customer_name },
    { key: "tax_type_name", label: "Tax Type", render: (r) => r.tax_type_name },
    { key: "item_code", label: "Item Code", render: (r) => r.item_code },
    { key: "item_name", label: "Item Name", render: (r) => r.item_name },
    { key: "qty", label: "Qty", align: "right", render: (r) => r.qty },
    { key: "line_total", label: "Line Total", align: "right", render: (r) => formatPeso(r.line_total) },
  ];
}

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
  const rows = await fetchAllPaginatedPages({
    pageSize: 200,
    fetchPage: async (page, pageSize) => {
      const qs = filtersToSearchParams(filters, { page, pageSize, sort: "order_date", order: "desc" });
      const res = await apiFetch<{ rows: QuotationStatusReportRow[] }>(
        `/api/v1/quotation/quotations/status-report?${qs}`,
      );
      if (!res.success || !res.data) throw new Error(res.message ?? "Failed to load report");
      return { rows: res.data.rows ?? [], total: res.meta?.total ?? 0 };
    },
  });

  const qs = filtersToSearchParams(filters, { page: 1, pageSize: 1, sort: "order_date", order: "desc" });
  const summaryRes = await apiFetch<{ summary: { total_qty: number; total_amount: number } }>(
    `/api/v1/quotation/quotations/status-report?${qs}`,
  );
  const totalQty = summaryRes.data?.summary?.total_qty ?? rows.reduce((s, r) => s + r.qty, 0);
  const totalAmount = summaryRes.data?.summary?.total_amount ?? rows.reduce((s, r) => s + r.line_total, 0);
  return { rows, totalQty, totalAmount };
}

function StatusPrintView() {
  const [params] = useSearchParams();
  const [generatedAt] = createSignal(new Date());
  const filters = () => parseFiltersFromSearch(params as Record<string, string | string[]>);
  const [data] = createResource(filters, fetchAllStatusRows);

  createEffect(() => {
    if (!data()) return;
    const timer = window.setTimeout(() => window.print(), 500);
    return () => window.clearTimeout(timer);
  });

  return (
    <div class="quotation-print">
      <Show when={data.loading}>
        <p class="quotation-print__loading">Loading all rows for print…</p>
      </Show>
      <Show when={data.error}>
        <p class="quotation-print__error">{String(data.error)}</p>
      </Show>
      <Show when={data()}>
        {(payload) => (
          <StatusReportPrintDocument
            docTitle="Quotation Status"
            docSubtitle={`${formatDisplayDate(filters().date_from)} ~ ${formatDisplayDate(filters().date_to)}`}
            columnMeta={[...QUOTE_STATUS_PRINT_COLUMNS_META]}
            columns={quotationStatusPrintColumns()}
            rows={payload().rows}
            generatedAt={generatedAt()}
            summaryFooter={(visible) => (
              <tr>
                <For each={visible}>
                  {(col, index) => (
                    <td class={col.align === "right" ? "num" : ""}>
                      {col.key === "qty"
                        ? payload().totalQty
                        : col.key === "line_total"
                          ? formatPeso(payload().totalAmount)
                          : index() === 0
                            ? "Total"
                            : ""}
                    </td>
                  )}
                </For>
              </tr>
            )}
          />
        )}
      </Show>
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
