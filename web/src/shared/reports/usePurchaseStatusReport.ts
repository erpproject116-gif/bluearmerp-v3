import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "../api";
import type { ReportType } from "./ReportTypeTabs";

export type PurchaseStatusFilters = {
  date_from: string;
  date_to: string;
  partner_id?: number | null;
  item_id?: number | null;
  progress_status?: string;
  report_type: ReportType;
};

export type PurchaseStatusRow = {
  supplier_invoice_id: number;
  date_no_display: string;
  invoice_no: string;
  progress_status: string;
  vendor_name: string;
  item_code: string;
  item_name: string;
  qty: number;
  line_total: number;
};

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatDisplayDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${m}/${d}/${y}`;
}

export function thisMonthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: from.toISOString().slice(0, 10), to: todayISO() };
}

export function defaultPurchaseStatusFilters(): PurchaseStatusFilters {
  const { from, to } = thisMonthRange();
  return { date_from: from, date_to: to, report_type: "details" };
}

function filtersToParams(filters: PurchaseStatusFilters, extra?: { page?: number; pageSize?: number }) {
  const qs = new URLSearchParams({ date_from: filters.date_from, date_to: filters.date_to, report_type: filters.report_type });
  if (filters.partner_id) qs.set("partner_id", String(filters.partner_id));
  if (filters.item_id) qs.set("item_id", String(filters.item_id));
  if (filters.progress_status) qs.set("progress_status", filters.progress_status);
  if (extra?.page) qs.set("page", String(extra.page));
  if (extra?.pageSize) qs.set("pageSize", String(extra.pageSize));
  return qs;
}

export function purchaseStatusExportUrl(filters: PurchaseStatusFilters): string {
  return `/api/v1/buying/reports/purchase-status/export?${filtersToParams(filters)}`;
}

export function usePurchaseStatusReport(params: () => {
  filters: PurchaseStatusFilters;
  page: number;
  pageSize: number;
  enabled: boolean;
}) {
  return createQuery(() => {
    const p = params();
    const qs = filtersToParams(p.filters, { page: p.page, pageSize: p.pageSize });
    return {
      queryKey: ["purchase-status-report", p],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<{
          rows: PurchaseStatusRow[];
          summary: { total_qty: number; total_amount: number };
        }>(`/api/v1/buying/reports/purchase-status?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load report");
        return {
          rows: res.data?.rows ?? [],
          summary: res.data?.summary ?? { total_qty: 0, total_amount: 0 },
          total: res.meta?.total ?? 0,
        };
      },
    };
  });
}
