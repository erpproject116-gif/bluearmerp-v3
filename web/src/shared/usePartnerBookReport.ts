import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";
import type { PartnerBookFilters } from "../modules/finance/reports/partnerBookFilters";

export type PartnerBookRow = {
  txn_date: string;
  slip_type: string;
  slip_no: string;
  date_no_display: string;
  partner_id: number;
  partner_name: string;
  description: string;
  debit: number;
  credit: number;
};

export type PartnerBookParams = {
  filters: PartnerBookFilters;
  page: number;
  pageSize: number;
  enabled: boolean;
};

function filtersToQs(filters: PartnerBookFilters, page: number, pageSize: number): URLSearchParams {
  const qs = new URLSearchParams({
    book_type: filters.book_type,
    date_from: filters.date_from,
    date_to: filters.date_to,
    page: String(page),
    pageSize: String(pageSize),
    sort: "txn_date",
    order: "asc",
  });
  if (filters.partner_id) qs.set("partner_id", String(filters.partner_id));
  return qs;
}

export function usePartnerBookReport(params: () => PartnerBookParams) {
  return createQuery(() => {
    const p = params();
    return {
      queryKey: ["partner-book", p.filters, p.page, p.pageSize],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<PartnerBookRow[]>(
          `/api/v1/finance/customer-vendor-book?${filtersToQs(p.filters, p.page, p.pageSize)}`,
        );
        if (!res.success) throw new Error(res.message ?? "Failed to load partner book");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 30_000,
    };
  });
}

export function useInvalidatePartnerBookReport() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["partner-book"] });
}
