import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { ProtectedRoute } from "../../../shared/ProtectedRoute";
import { apiFetch } from "../../../shared/api";
import { fetchAllPaginatedPages } from "../../../shared/fetchAllPaginated";
import { StatusReportPrintDocument, type StatusPrintColumn } from "../../../shared/statusReportPrint";
import type { StatusReportRow } from "../../../shared/useRepairOrderStatusReport";
import {
  defaultStatusFilters,
  filtersToSearchParams,
  formatDisplayDate,
  type RepairOrderStatusFilters,
} from "./repairOrderStatusFilters";
import "../after-sales/repairOrderPrint.css";
import "./statusReportPrint.css";

const REPAIR_STATUS_PRINT_COLUMNS_META = [
  { key: "date_no_display", label: "Date-No." },
  { key: "repair_order_no", label: "Repair Order No" },
  { key: "progress_status", label: "Progress" },
  { key: "location_name", label: "Location" },
  { key: "pic_name", label: "PIC" },
  { key: "customer_name", label: "Customer" },
  { key: "latest_update", label: "Latest Update" },
  { key: "item_code", label: "Item Code" },
  { key: "item_name_display", label: "Item Name [Spec]" },
  { key: "qty", label: "Qty" },
  { key: "remark", label: "Remark" },
] as const;

function repairOrderStatusPrintColumns(): StatusPrintColumn<StatusReportRow>[] {
  return [
    { key: "date_no_display", label: "Date-No.", render: (r) => r.date_no_display },
    { key: "repair_order_no", label: "Repair Order No", render: (r) => r.repair_order_no },
    {
      key: "progress_status",
      label: "Progress",
      render: (r) => (r.progress_status === "finished" ? "Finished" : "Received"),
    },
    { key: "location_name", label: "Location", render: (r) => r.location_name },
    { key: "pic_name", label: "PIC", render: (r) => r.pic_name },
    { key: "customer_name", label: "Customer", render: (r) => r.customer_name },
    { key: "latest_update", label: "Latest Update", render: (r) => r.latest_update ?? "" },
    { key: "item_code", label: "Item Code", render: (r) => r.item_code },
    { key: "item_name_display", label: "Item Name [Spec]", render: (r) => r.item_name_display },
    { key: "qty", label: "Qty", align: "right", render: (r) => r.qty },
    { key: "remark", label: "Remark", render: (r) => r.remark ?? "" },
  ];
}

function parseFiltersFromSearch(params: Record<string, string | string[]>): RepairOrderStatusFilters {
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
    progress_status: get("progress_status") || undefined,
    partner_id: num("partner_id"),
    item_id: num("item_id"),
  };
}

async function fetchAllStatusRows(filters: RepairOrderStatusFilters) {
  const rows = await fetchAllPaginatedPages({
    pageSize: 200,
    fetchPage: async (page, pageSize) => {
      const qs = filtersToSearchParams(filters, { page, pageSize, sort: "order_date", order: "desc" });
      const res = await apiFetch<{ rows: StatusReportRow[] }>(
        `/api/v1/inventory/repair-orders/status-report?${qs}`,
      );
      if (!res.success || !res.data) throw new Error(res.message ?? "Failed to load report");
      return { rows: res.data.rows ?? [], total: res.meta?.total ?? 0 };
    },
  });

  const qs = filtersToSearchParams(filters, { page: 1, pageSize: 1, sort: "order_date", order: "desc" });
  const summaryRes = await apiFetch<{ summary: { total_qty: number } }>(
    `/api/v1/inventory/repair-orders/status-report?${qs}`,
  );
  const totalQty = summaryRes.data?.summary?.total_qty ?? rows.reduce((s, r) => s + r.qty, 0);
  return { rows, totalQty };
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
    <div class="repair-print">
      <Show when={data.loading}>
        <p class="repair-print__loading">Loading all rows for print…</p>
      </Show>
      <Show when={data.error}>
        <p class="repair-print__error">{String(data.error)}</p>
      </Show>
      <Show when={data()}>
        {(payload) => (
          <StatusReportPrintDocument
            docTitle="Repair Order Status"
            docSubtitle={`${formatDisplayDate(filters().date_from)} ~ ${formatDisplayDate(filters().date_to)}`}
            columnMeta={[...REPAIR_STATUS_PRINT_COLUMNS_META]}
            columns={repairOrderStatusPrintColumns()}
            rows={payload().rows}
            generatedAt={generatedAt()}
            brandingVariant="repair"
            tableClass="repair-print__table"
            pageClass="repair-print__page status-report-print"
            summaryFooter={(visible) => (
              <tr>
                <For each={visible}>
                  {(col, index) => (
                    <td class={col.align === "right" ? "num repair-print__total" : index() === 0 ? "repair-print__total-label" : ""}>
                      {col.key === "qty"
                        ? payload().totalQty
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

export default function RepairOrderStatusPrintPage() {
  return (
    <ProtectedRoute>
      <StatusPrintView />
    </ProtectedRoute>
  );
}
