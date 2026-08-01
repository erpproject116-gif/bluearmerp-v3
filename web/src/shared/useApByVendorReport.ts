import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type ApByVendorFilters = {
  date_from?: string;
  date_to?: string;
  partner_id?: number | null;
  location_id?: number | null;
  project_id?: number | null;
  pic_user_id?: number | null;
};

export type ApByVendorRow = {
  partner_id: number;
  vendor_name: string;
  inv_purchases: number;
  acct_purchases: number;
  total_billed: number;
  total_paid: number;
  balance: number;
};

export type ApByVendorParams = {
  filters: ApByVendorFilters;
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  enabled: boolean;
};

export function apFiltersToSearchParams(
  filters: ApByVendorFilters,
  extra?: { page?: number; pageSize?: number; sort?: string; order?: string },
): URLSearchParams {
  const qs = new URLSearchParams();
  if (filters.date_from) qs.set("date_from", filters.date_from);
  if (filters.date_to) qs.set("date_to", filters.date_to);
  if (filters.partner_id) qs.set("partner_id", String(filters.partner_id));
  if (filters.location_id) qs.set("location_id", String(filters.location_id));
  if (filters.project_id) qs.set("project_id", String(filters.project_id));
  if (filters.pic_user_id) qs.set("pic_user_id", String(filters.pic_user_id));
  if (extra?.page) qs.set("page", String(extra.page));
  if (extra?.pageSize) qs.set("pageSize", String(extra.pageSize));
  if (extra?.sort) qs.set("sort", extra.sort);
  if (extra?.order) qs.set("order", extra.order);
  return qs;
}

export function apByVendorExportUrl(filters: ApByVendorFilters): string {
  return `/api/v1/finance/ap-by-vendor/export?${apFiltersToSearchParams(filters).toString()}`;
}

export function useApByVendorReport(params: () => ApByVendorParams) {
  return createQuery(() => {
    const p = params();
    const f = p.filters;
    const qs = apFiltersToSearchParams(f, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });
    return {
      queryKey: [
        "ap-by-vendor",
        p.page,
        p.pageSize,
        p.sort,
        p.order,
        f.date_from ?? "",
        f.date_to ?? "",
        f.partner_id ?? 0,
        f.location_id ?? 0,
        f.project_id ?? 0,
        f.pic_user_id ?? 0,
      ],
      enabled: p.enabled,
      refetchOnWindowFocus: false,
      staleTime: 60_000,
      queryFn: async () => {
        const res = await apiFetch<ApByVendorRow[]>(`/api/v1/finance/ap-by-vendor?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load A/P report");
        return {
          rows: res.data ?? [],
          total: res.meta?.total ?? 0,
          page: res.meta?.page ?? p.page,
          perPage: res.meta?.per_page ?? p.pageSize,
        };
      },
    };
  });
}

export function useInvalidateApByVendorReport() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["ap-by-vendor"] });
}
