import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type SerialReportListParams = {
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  enabled?: boolean;
  runId?: number;
};

export type SerialStatusFilters = {
  view?: "details" | "summary";
  q?: string;
  serial_no?: string;
  status?: string;
  event_type?: string;
  ref_type?: string;
  item_id?: number;
  location_id?: number;
  date_from?: string;
  date_to?: string;
  validity_from?: string;
  validity_to?: string;
};

export type SerialBookFilters = {
  view?: "general" | "summary";
  date_from: string;
  date_to: string;
  q?: string;
  serial_no?: string;
  item_id?: number;
  location_id?: number;
  event_type?: string;
  inventory_qty?: string;
  include_void?: boolean;
  include_transfers?: boolean;
  exclude_no_tx?: boolean;
  validity_from?: string;
  validity_to?: string;
};

export type SerialBalanceFilters = {
  view?: "serial" | "by_location";
  as_of?: string;
  q?: string;
  serial_no?: string;
  status?: string;
  item_id?: number;
  location_id?: number;
  inventory_qty?: string;
  include_void?: boolean;
};

export type SerialReconciliationFilters = {
  compare_by?: "serial" | "item";
  q?: string;
  item_id?: number;
  location_id?: number;
  mismatches_only?: boolean;
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

export type SerialStatusDetailRow = {
  id: number;
  serial_no: string;
  item_id: number;
  item_code: string;
  item_name: string;
  status: string;
  location_id?: number | null;
  location_name?: string;
  warranty_start?: string | null;
  warranty_end?: string | null;
  last_event_type?: string | null;
  last_event_at?: string | null;
  event_count: number;
};

export type SerialStatusSummaryRow = {
  item_code: string;
  item_name: string;
  status: string;
  location_name: string;
  unit_count: number;
};

export type SerialBookDetailRow = {
  id: number;
  created_at: string;
  serial_no: string;
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

export type SerialBookSummaryRow = {
  serial_no: string;
  item_code: string;
  item_name: string;
  location_name: string;
  opening_qty: number;
  received_qty: number;
  issued_qty: number;
  closing_qty: number;
};

export type SerialBalanceRow = {
  serial_no: string;
  item_id: number;
  item_code: string;
  item_name: string;
  location_id?: number | null;
  location_name?: string;
  qty_on_hand: number;
  status: string;
};

export type SerialReconciliationRow = {
  serial_no?: string | null;
  item_id: number;
  item_code: string;
  item_name: string;
  location_id?: number | null;
  location_name?: string;
  item_qty_on_hand: number;
  serial_unit_count: number;
  variance: number;
};

export function serialStatusExportUrl(filters: SerialStatusFilters): string {
  return `/api/v1/inventory/serial-reports/status/export?${reportQs(filters as Record<string, string | number | boolean | undefined>, { page: 1, pageSize: 1, sort: "", order: "asc" })}`;
}

export function useSerialStatusReport(
  params: () => SerialReportListParams & { filters: SerialStatusFilters },
) {
  return createQuery(() => {
    const p = params();
    const qs = reportQs(p.filters as Record<string, string | number | boolean | undefined>, p);
    return {
      queryKey: ["serial-report-status", p],
      enabled: p.enabled !== false,
      queryFn: async () => {
        const res = await apiFetch<SerialStatusDetailRow[] | SerialStatusSummaryRow[]>(
          `/api/v1/inventory/serial-reports/status?${qs}`,
        );
        if (!res.success) throw new Error(res.message ?? "Failed to load report");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0, view: p.filters.view ?? "details" };
      },
      staleTime: 15_000,
    };
  });
}

export function serialBookExportUrl(filters: SerialBookFilters): string {
  return `/api/v1/inventory/serial-reports/book/export?${reportQs(filters as Record<string, string | number | boolean | undefined>, { page: 1, pageSize: 1, sort: "", order: "asc" })}`;
}

export function useSerialBookReport(params: () => SerialReportListParams & { filters: SerialBookFilters }) {
  return createQuery(() => {
    const p = params();
    const qs = reportQs(p.filters as Record<string, string | number | boolean | undefined>, p);
    return {
      queryKey: ["serial-report-book", p.filters, p.page, p.pageSize, p.sort, p.order, p.runId ?? 0],
      enabled: p.enabled !== false,
      queryFn: async () => {
        const res = await apiFetch<SerialBookDetailRow[] | SerialBookSummaryRow[]>(
          `/api/v1/inventory/serial-reports/book?${qs}`,
        );
        if (!res.success) throw new Error(res.message ?? "Failed to load report");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0, view: p.filters.view ?? "general" };
      },
      staleTime: 0,
    };
  });
}

export function serialBalanceExportUrl(filters: SerialBalanceFilters): string {
  return `/api/v1/inventory/serial-reports/balance/export?${reportQs(filters as Record<string, string | number | boolean | undefined>, { page: 1, pageSize: 1, sort: "", order: "asc" })}`;
}

export function useSerialBalanceReport(
  params: () => SerialReportListParams & { filters: SerialBalanceFilters },
) {
  return createQuery(() => {
    const p = params();
    const qs = reportQs(p.filters as Record<string, string | number | boolean | undefined>, p);
    return {
      queryKey: ["serial-report-balance", p],
      enabled: p.enabled !== false,
      queryFn: async () => {
        const res = await apiFetch<SerialBalanceRow[]>(`/api/v1/inventory/serial-reports/balance?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load report");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 15_000,
    };
  });
}

export function serialReconciliationExportUrl(filters: SerialReconciliationFilters): string {
  return `/api/v1/inventory/serial-reports/reconciliation/export?${reportQs(filters as Record<string, string | number | boolean | undefined>, { page: 1, pageSize: 1, sort: "", order: "asc" })}`;
}

export function useSerialReconciliationReport(
  params: () => SerialReportListParams & { filters: SerialReconciliationFilters },
) {
  return createQuery(() => {
    const p = params();
    const qs = reportQs(p.filters as Record<string, string | number | boolean | undefined>, p);
    return {
      queryKey: ["serial-report-reconciliation", p],
      enabled: p.enabled !== false,
      queryFn: async () => {
        const res = await apiFetch<SerialReconciliationRow[]>(
          `/api/v1/inventory/serial-reports/reconciliation?${qs}`,
        );
        if (!res.success) throw new Error(res.message ?? "Failed to load report");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0, compareBy: p.filters.compare_by ?? "serial" };
      },
      staleTime: 15_000,
    };
  });
}

function localISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function defaultSerialBookDateRange(): { date_from: string; date_to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(1);
  return {
    date_from: localISODate(from),
    date_to: localISODate(to),
  };
}
