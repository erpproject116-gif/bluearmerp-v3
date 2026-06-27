import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { ProtectedRoute } from "../../../shared/ProtectedRoute";
import { apiFetch } from "../../../shared/api";
import { fetchAllPaginatedPages } from "../../../shared/fetchAllPaginated";
import {
  StatusReportPrintDocument,
  type StatusPrintColumn,
} from "../../../shared/statusReportPrint";
import type { PurchaseRequestStatusReportRow } from "../../../shared/usePurchaseRequestStatusReport";
import {
  defaultStatusFilters,
  filtersToSearchParams,
  formatDisplayDate,
  type PurchaseRequestStatusFilters,
} from "./purchaseRequestStatusFilters";
import { progressStatusLabel } from "./progressStatus";
import "../../quotation/quotation/quotationPrint.css";

const PR_STATUS_PRINT_COLUMNS_META = [
  { key: "date_no_display", label: "Date-No." },
  { key: "purchase_request_no", label: "PR No." },
  { key: "progress_status", label: "Progress" },
  { key: "send_status", label: "Send" },
  { key: "domestic_foreign", label: "D/F" },
  { key: "location_name", label: "Location" },
  { key: "pic_name", label: "PIC" },
  { key: "partner_name", label: "Partner" },
  { key: "item_code", label: "Item Code" },
  { key: "item_name", label: "Item Name" },
  { key: "spec_name", label: "Spec" },
  { key: "qty", label: "Qty" },
  { key: "line_total", label: "Line Total" },
  { key: "remark", label: "Remark" },
] as const;

function money(n: number) {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function purchaseRequestStatusPrintColumns(): StatusPrintColumn<PurchaseRequestStatusReportRow>[] {
  return [
    { key: "date_no_display", label: "Date-No.", render: (r) => r.date_no_display },
    { key: "purchase_request_no", label: "PR No.", render: (r) => r.purchase_request_no },
    { key: "progress_status", label: "Progress", render: (r) => progressStatusLabel(r.progress_status) },
    { key: "send_status", label: "Send", render: (r) => (r.send_status === "sent" ? "Sent" : "Unsent") },
    { key: "domestic_foreign", label: "D/F", render: (r) => (r.domestic_foreign === "foreign" ? "Foreign" : "Domestic") },
    { key: "location_name", label: "Location", render: (r) => r.location_name },
    { key: "pic_name", label: "PIC", render: (r) => r.pic_name },
    { key: "partner_name", label: "Partner", render: (r) => r.partner_name },
    { key: "item_code", label: "Item Code", render: (r) => r.item_code },
    { key: "item_name", label: "Item Name", render: (r) => r.item_name },
    { key: "spec_name", label: "Spec", render: (r) => r.spec_name ?? "" },
    { key: "qty", label: "Qty", align: "right", render: (r) => r.qty },
    { key: "line_total", label: "Line Total", align: "right", render: (r) => money(r.line_total) },
    { key: "remark", label: "Remark", render: (r) => r.remark ?? "" },
  ];
}

function parseFiltersFromSearch(params: Record<string, string | string[]>): PurchaseRequestStatusFilters {
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
  const df = get("domestic_foreign");
  const ss = get("send_status");
  return {
    date_from: get("date_from") || base.date_from,
    date_to: get("date_to") || base.date_to,
    location_id: num("location_id"),
    project_id: num("project_id"),
    partner_id: num("partner_id"),
    item_id: num("item_id"),
    domestic_foreign: df === "domestic" || df === "foreign" ? df : "all",
    send_status: ss === "unsent" || ss === "sent" ? ss : "all",
    progress_status: get("progress_status") || undefined,
  };
}

async function fetchAllStatusRows(filters: PurchaseRequestStatusFilters) {
  const rows = await fetchAllPaginatedPages({
    pageSize: 200,
    fetchPage: async (page, pageSize) => {
      const qs = filtersToSearchParams(filters, { page, pageSize, sort: "request_date", order: "desc" });
      const res = await apiFetch<{ rows: PurchaseRequestStatusReportRow[]; summary: { total_qty: number; total_amount: number } }>(
        `/api/v1/purchase-request/purchase-requests/status-report?${qs}`,
      );
      if (!res.success || !res.data) throw new Error(res.message ?? "Failed to load report");
      return { rows: res.data.rows ?? [], total: res.meta?.total ?? 0 };
    },
  });

  let totalQty = 0;
  let totalAmount = 0;
  const qs = filtersToSearchParams(filters, { page: 1, pageSize: 1, sort: "request_date", order: "desc" });
  const summaryRes = await apiFetch<{ summary: { total_qty: number; total_amount: number } }>(
    `/api/v1/purchase-request/purchase-requests/status-report?${qs}`,
  );
  if (summaryRes.success && summaryRes.data?.summary) {
    totalQty = summaryRes.data.summary.total_qty;
    totalAmount = summaryRes.data.summary.total_amount;
  } else {
    totalQty = rows.reduce((sum, r) => sum + r.qty, 0);
    totalAmount = rows.reduce((sum, r) => sum + r.line_total, 0);
  }

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
            docTitle="Purchase Request Status"
            docSubtitle={`${formatDisplayDate(filters().date_from)} ~ ${formatDisplayDate(filters().date_to)}`}
            columnMeta={[...PR_STATUS_PRINT_COLUMNS_META]}
            columns={purchaseRequestStatusPrintColumns()}
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
                          ? money(payload().totalAmount)
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

export default function PurchaseRequestStatusPrintPage() {
  return (
    <ProtectedRoute>
      <StatusPrintView />
    </ProtectedRoute>
  );
}
