import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { ProtectedRoute } from "../../../shared/ProtectedRoute";
import { apiFetch } from "../../../shared/api";
import {
  defaultStatusFilters,
  filtersToSearchParams,
  formatDisplayDate,
  type RepairOrderStatusFilters,
} from "./repairOrderStatusFilters";
import type { StatusReportRow } from "../../../shared/useRepairOrderStatusReport";
import { PrintBrandingHeader } from "../../../shared/branding/PrintBrandingHeader";
import { PrintBrandingFooter } from "../../../shared/branding/PrintBrandingFooter";
import "../after-sales/repairOrderPrint.css";
import "./statusReportPrint.css";

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
  const rows: StatusReportRow[] = [];
  let totalQty = 0;
  let page = 1;
  const pageSize = 100;
  while (page <= 50) {
    const qs = filtersToSearchParams(filters, { page, pageSize, sort: "order_date", order: "desc" });
    const res = await apiFetch<{ rows: StatusReportRow[]; summary: { total_qty: number } }>(
      `/api/v1/inventory/repair-orders/status-report?${qs}`,
    );
    if (!res.success || !res.data) throw new Error(res.message ?? "Failed to load report");
    rows.push(...(res.data.rows ?? []));
    totalQty = res.data.summary?.total_qty ?? totalQty;
    const total = res.meta?.total ?? 0;
    if (rows.length >= total) break;
    page++;
  }
  return { rows, totalQty };
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
    <div class="repair-print">
      <Show when={data.loading}>
        <p class="repair-print__loading">Loading…</p>
      </Show>
      <Show when={data.error}>
        <p class="repair-print__error">{String(data.error)}</p>
      </Show>
      <Show when={data()}>
        {(payload) => (
          <article class="repair-print__page status-report-print">
            <PrintBrandingHeader
              variant="repair"
              docTitle="Repair Order Status"
              docSubtitle={`${formatDisplayDate(filters().date_from)} ~ ${formatDisplayDate(filters().date_to)}`}
            />
            <table class="repair-print__table">
              <thead>
                <tr>
                  <th>Date-No.</th>
                  <th>Repair Order No</th>
                  <th>Progress</th>
                  <th>Location</th>
                  <th>PIC</th>
                  <th>Customer</th>
                  <th>Latest Update</th>
                  <th>Item Code</th>
                  <th>Item Name [Spec]</th>
                  <th class="num">Qty</th>
                  <th>Remark</th>
                </tr>
              </thead>
              <tbody>
                <For each={payload().rows}>
                  {(row) => (
                    <tr>
                      <td>{row.date_no_display}</td>
                      <td>{row.repair_order_no}</td>
                      <td>{row.progress_status === "finished" ? "Finished" : "Received"}</td>
                      <td>{row.location_name}</td>
                      <td>{row.pic_name}</td>
                      <td>{row.customer_name}</td>
                      <td>{row.latest_update ?? ""}</td>
                      <td>{row.item_code}</td>
                      <td>{row.item_name_display}</td>
                      <td class="num">{row.qty}</td>
                      <td>{row.remark ?? ""}</td>
                    </tr>
                  )}
                </For>
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={9} class="repair-print__total-label">
                    Total
                  </td>
                  <td class="num repair-print__total">{payload().totalQty}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
            <PrintBrandingFooter
              class="repair-print__footer"
              defaultFooter={`[P.1] · ${generatedAt().toLocaleString()}`}
            />
          </article>
        )}
      </Show>
      <div class="repair-print__toolbar no-print">
        <button type="button" class="repair-print__btn" onClick={() => window.print()}>
          Print
        </button>
        <button type="button" class="repair-print__btn repair-print__btn--muted" onClick={() => window.close()}>
          Close
        </button>
      </div>
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
