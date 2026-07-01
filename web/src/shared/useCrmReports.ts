import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

// --- Customer quotations by item ---

export type CustomerQuotationsFilters = {
  item_id?: number | null;
  date_from?: string;
  date_to?: string;
  partner_id?: number | null;
};

export type CustomerQuotationsRow = {
  partner_id: number;
  customer_name: string;
  quotation_count: number;
  total_qty: number;
  item_id: number;
  item_code: string;
  item_name: string;
};

export type CrmReportParams<F> = {
  filters: F;
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  enabled: boolean;
};

function reportQs(
  filters: Record<string, string | number | null | undefined>,
  extra?: { page?: number; pageSize?: number; sort?: string; order?: string },
): URLSearchParams {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v != null && v !== "") qs.set(k, String(v));
  }
  if (extra?.page) qs.set("page", String(extra.page));
  if (extra?.pageSize) qs.set("pageSize", String(extra.pageSize));
  if (extra?.sort) qs.set("sort", extra.sort);
  if (extra?.order) qs.set("order", extra.order);
  return qs;
}

export function customerQuotationsExportUrl(filters: CustomerQuotationsFilters): string {
  return `/api/v1/crm/reports/customer-quotations-by-item/export?${reportQs(filters as Record<string, string | number | null | undefined>).toString()}`;
}

export function useCustomerQuotationsReport(params: () => CrmReportParams<CustomerQuotationsFilters>) {
  return createQuery(() => {
    const p = params();
    const qs = reportQs(p.filters as Record<string, string | number | null | undefined>, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });
    return {
      queryKey: ["crm-report-customer-quotations", p],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<CustomerQuotationsRow[]>(
          `/api/v1/crm/reports/customer-quotations-by-item?${qs}`,
        );
        if (!res.success) throw new Error(res.message ?? "Failed to load report");
        return {
          rows: res.data ?? [],
          total: res.meta?.total ?? 0,
        };
      },
      staleTime: 15_000,
    };
  });
}

// --- Item demand ---

export type ItemDemandFilters = {
  date_from?: string;
  date_to?: string;
  item_id?: number | null;
};

export type ItemDemandRow = {
  item_id: number;
  item_code: string;
  item_name: string;
  quoted_qty: number;
  sold_qty: number;
  quotation_count: number;
  sales_count: number;
};

export function itemDemandExportUrl(filters: ItemDemandFilters): string {
  return `/api/v1/crm/reports/item-demand/export?${reportQs(filters as Record<string, string | number | null | undefined>).toString()}`;
}

export function useItemDemandReport(params: () => CrmReportParams<ItemDemandFilters>) {
  return createQuery(() => {
    const p = params();
    const qs = reportQs(p.filters as Record<string, string | number | null | undefined>, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });
    return {
      queryKey: ["crm-report-item-demand", p],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<ItemDemandRow[]>(`/api/v1/crm/reports/item-demand?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load report");
        return {
          rows: res.data ?? [],
          total: res.meta?.total ?? 0,
        };
      },
      staleTime: 15_000,
    };
  });
}

// --- Conversion funnel ---

export type ConversionFunnelFilters = {
  date_from?: string;
  date_to?: string;
};

export type ConversionFunnelRow = {
  stage: string;
  label: string;
  count: number;
};

export function conversionFunnelExportUrl(filters: ConversionFunnelFilters): string {
  return `/api/v1/crm/reports/conversion-funnel/export?${reportQs(filters as Record<string, string | number | null | undefined>).toString()}`;
}

export function useConversionFunnelReport(params: () => CrmReportParams<ConversionFunnelFilters>) {
  return createQuery(() => {
    const p = params();
    const qs = reportQs(p.filters as Record<string, string | number | null | undefined>, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });
    return {
      queryKey: ["crm-report-conversion-funnel", p],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<ConversionFunnelRow[]>(`/api/v1/crm/reports/conversion-funnel?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load report");
        return {
          rows: res.data ?? [],
          total: res.meta?.total ?? 0,
        };
      },
      staleTime: 15_000,
    };
  });
}

// --- Low stock ---

export type LowStockFilters = {
  location_id?: number | null;
  item_id?: number | null;
};

export type LowStockRow = {
  item_id: number;
  item_code: string;
  item_name: string;
  location_id: number;
  location_name: string;
  qty_on_hand: number;
  reorder_level: number;
  shortfall: number;
};

export function lowStockExportUrl(filters: LowStockFilters): string {
  return `/api/v1/crm/reports/low-stock/export?${reportQs(filters as Record<string, string | number | null | undefined>).toString()}`;
}

export function useLowStockReport(params: () => CrmReportParams<LowStockFilters>) {
  return createQuery(() => {
    const p = params();
    const qs = reportQs(p.filters as Record<string, string | number | null | undefined>, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });
    return {
      queryKey: ["crm-report-low-stock", p],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<LowStockRow[]>(`/api/v1/crm/reports/low-stock?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load report");
        return {
          rows: res.data ?? [],
          total: res.meta?.total ?? 0,
        };
      },
      staleTime: 15_000,
    };
  });
}

// --- Expired quotations ---

export type ExpiredQuotationsFilters = {
  date_from?: string;
  date_to?: string;
};

export type ExpiredQuotationRow = {
  quotation_id: number;
  line_id: number;
  reference_no: string;
  customer_name: string;
  valid_until?: string;
  item_code: string;
  item_name: string;
  qty: number;
  line_total: number;
};

export function expiredQuotationsExportUrl(filters: ExpiredQuotationsFilters): string {
  return `/api/v1/crm/reports/expired-quotations/export?${reportQs(filters as Record<string, string | number | null | undefined>).toString()}`;
}

export function useExpiredQuotationsReport(params: () => CrmReportParams<ExpiredQuotationsFilters>) {
  return createQuery(() => {
    const p = params();
    const qs = reportQs(p.filters as Record<string, string | number | null | undefined>, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });
    return {
      queryKey: ["crm-report-expired-quotations", p],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<ExpiredQuotationRow[]>(`/api/v1/crm/reports/expired-quotations?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load report");
        return {
          rows: res.data ?? [],
          total: res.meta?.total ?? 0,
        };
      },
      staleTime: 15_000,
    };
  });
}

// --- Alert rules ---

export type CrmAlertRule = {
  id: number;
  rule_type: string;
  name: string;
  is_enabled: boolean;
  lead_value: number;
  lead_unit: "days" | "months";
  threshold_json?: Record<string, unknown>;
  notify_role_codes?: string[];
  notify_user_ids?: number[];
  sort_order: number;
};

export function useCrmAlertRules(enabled = true) {
  return createQuery(() => ({
    queryKey: ["crm-alert-rules"],
    enabled,
    queryFn: async () => {
      const res = await apiFetch<CrmAlertRule[]>("/api/v1/crm/alert-rules");
      if (!res.success) throw new Error(res.message ?? "Failed to load alert rules");
      return res.data ?? [];
    },
    staleTime: 30_000,
  }));
}

export async function patchCrmAlertRule(
  id: number,
  payload: Partial<{ is_enabled: boolean; lead_value: number; lead_unit: string; name: string }>,
) {
  return apiFetch(`/api/v1/crm/alert-rules/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  }, { successMessage: "Alert rule updated." });
}

export function useInvalidateCrmReports() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: ["crm-report-customer-quotations"] });
    void client.invalidateQueries({ queryKey: ["crm-report-item-demand"] });
    void client.invalidateQueries({ queryKey: ["crm-report-conversion-funnel"] });
    void client.invalidateQueries({ queryKey: ["crm-report-low-stock"] });
    void client.invalidateQueries({ queryKey: ["crm-report-expired-quotations"] });
    void client.invalidateQueries({ queryKey: ["crm-alert-rules"] });
  };
}
