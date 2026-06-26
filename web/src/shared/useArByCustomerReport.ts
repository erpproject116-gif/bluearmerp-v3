import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type ArByCustomerFilters = {
  date_from?: string;
  date_to?: string;
  partner_id?: number | null;
  location_id?: number | null;
  department_id?: number | null;
  project_id?: number | null;
  pic_user_id?: number | null;
};

export type ArByCustomerRow = {
  partner_id: number;
  customer_name: string;
  total_sales: number;
  total_received: number;
  balance: number;
};

export type ArByCustomerParams = {
  filters: ArByCustomerFilters;
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  enabled: boolean;
};

export function arFiltersToSearchParams(
  filters: ArByCustomerFilters,
  extra?: { page?: number; pageSize?: number; sort?: string; order?: string },
): URLSearchParams {
  const qs = new URLSearchParams();
  if (filters.date_from) qs.set("date_from", filters.date_from);
  if (filters.date_to) qs.set("date_to", filters.date_to);
  if (filters.partner_id) qs.set("partner_id", String(filters.partner_id));
  if (filters.location_id) qs.set("location_id", String(filters.location_id));
  if (filters.department_id) qs.set("department_id", String(filters.department_id));
  if (filters.project_id) qs.set("project_id", String(filters.project_id));
  if (filters.pic_user_id) qs.set("pic_user_id", String(filters.pic_user_id));
  if (extra?.page) qs.set("page", String(extra.page));
  if (extra?.pageSize) qs.set("pageSize", String(extra.pageSize));
  if (extra?.sort) qs.set("sort", extra.sort);
  if (extra?.order) qs.set("order", extra.order);
  return qs;
}

export function arByCustomerExportUrl(filters: ArByCustomerFilters): string {
  return `/api/v1/finance/ar-by-customer/export?${arFiltersToSearchParams(filters).toString()}`;
}

export function useArByCustomerReport(params: () => ArByCustomerParams) {
  return createQuery(() => {
    const p = params();
    const qs = arFiltersToSearchParams(p.filters, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });
    return {
      queryKey: ["ar-by-customer", p],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<ArByCustomerRow[]>(`/api/v1/finance/ar-by-customer?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load A/R report");
        return {
          rows: res.data ?? [],
          total: res.meta?.total ?? 0,
          page: res.meta?.page ?? p.page,
          perPage: res.meta?.per_page ?? p.pageSize,
        };
      },
      staleTime: 15_000,
    };
  });
}

export function useInvalidateArByCustomerReport() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["ar-by-customer"] });
}
