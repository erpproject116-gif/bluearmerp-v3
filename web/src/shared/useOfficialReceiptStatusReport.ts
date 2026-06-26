import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";
import {
  filtersToSearchParams,
  type OfficialReceiptStatusFilters,
} from "../modules/finance/reports/officialReceiptStatusFilters";

export type OfficialReceiptStatusRow = {
  receipt_id: number;
  date_no_display: string;
  customer_name: string;
  amount: number;
  remark: string;
};

export type OfficialReceiptStatusParams = {
  filters: OfficialReceiptStatusFilters;
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  enabled: boolean;
};

export function officialReceiptStatusExportUrl(filters: OfficialReceiptStatusFilters): string {
  return `/api/v1/finance/official-receipt-status/export?${filtersToSearchParams(filters).toString()}`;
}

export function useOfficialReceiptStatusReport(params: () => OfficialReceiptStatusParams) {
  return createQuery(() => {
    const p = params();
    const qs = filtersToSearchParams(p.filters, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });
    return {
      queryKey: ["official-receipt-status", p],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<OfficialReceiptStatusRow[]>(`/api/v1/finance/official-receipt-status?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load official receipt status");
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

export function useInvalidateOfficialReceiptStatusReport() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["official-receipt-status"] });
}
