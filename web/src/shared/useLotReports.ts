import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "./api";
import type { SerialReportListParams } from "./useSerialReports";

export type LotBookFilters = {
  view?: "general" | "summary";
  date_from: string;
  date_to: string;
  q?: string;
  lot_no?: string;
  item_id?: number;
  location_id?: number;
  event_type?: string;
  ref_type?: string;
  inventory_qty?: string;
  include_transfers?: boolean;
  exclude_no_tx?: boolean;
  validity_from?: string;
  validity_to?: string;
};

export type LotBookDetailRow = {
  id: number;
  created_at: string;
  lot_no: string;
  item_code: string;
  item_name: string;
  location_name: string;
  terms_of_validity?: string | null;
  slip_type: string;
  partner_name: string;
  event_type: string;
  opening_qty: number;
  increase_qty: number;
  release_qty: number;
  inventory_qty: number;
  qty_delta: number;
  ref_type?: string | null;
  ref_id?: number | null;
  notes?: string | null;
};

export type LotBookSummaryRow = {
  lot_no: string;
  item_code: string;
  item_name: string;
  location_name: string;
  opening_qty: number;
  received_qty: number;
  issued_qty: number;
  closing_qty: number;
};

function reportQs(
  filters: Record<string, string | number | boolean | null | undefined>,
  extra: SerialReportListParams,
): string {
  const qs = new URLSearchParams({
    page: String(extra.page),
    pageSize: String(extra.pageSize),
    sort: extra.sort,
    order: extra.order,
  });
  for (const [k, v] of Object.entries(filters)) {
    if (v == null || v === "") continue;
    if (typeof v === "boolean") {
      if (v) qs.set(k, "1");
      continue;
    }
    qs.set(k, String(v));
  }
  return qs.toString();
}

export function lotBookExportUrl(filters: LotBookFilters): string {
  return `/api/v1/inventory/lot-reports/book/export?${reportQs(filters as Record<string, string | number | boolean | undefined>, { page: 1, pageSize: 1, sort: "", order: "asc" })}`;
}

export function useLotBookReport(params: () => SerialReportListParams & { filters: LotBookFilters }) {
  return createQuery(() => {
    const p = params();
    const qs = reportQs(p.filters as Record<string, string | number | boolean | undefined>, p);
    return {
      queryKey: ["lot-report-book", p.filters, p.page, p.pageSize, p.sort, p.order, p.runId ?? 0],
      enabled: p.enabled !== false,
      queryFn: async () => {
        const res = await apiFetch<LotBookDetailRow[] | LotBookSummaryRow[]>(
          `/api/v1/inventory/lot-reports/book?${qs}`,
        );
        if (!res.success) throw new Error(res.message ?? "Failed to load report");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0, view: p.filters.view ?? "general" };
      },
      staleTime: 0,
    };
  });
}

function localISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function defaultLotBookDateRange(): { date_from: string; date_to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(1);
  return {
    date_from: localISODate(from),
    date_to: localISODate(to),
  };
}
