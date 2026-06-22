import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";
import type { PriceBatchFilters } from "../modules/sales/sales/salesStatusFilters";
import { filtersToSearchParams } from "../modules/sales/sales/salesStatusFilters";

export type PriceBatchLineRow = {
  sales_id: number;
  line_id: number;
  date_no_display: string;
  sales_no: string;
  customer_name: string;
  pic_name: string;
  location_name: string;
  tax_type_name: string;
  progress_status: string;
  item_code: string;
  item_name: string;
  description?: string | null;
  qty: number;
  unit_non_vat: number;
  non_vat_total: number;
  tax_amount: number;
};

export type PriceBatchParams = {
  filters: PriceBatchFilters;
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  enabled: boolean;
};

export function usePriceBatchLines(params: () => PriceBatchParams) {
  return createQuery(() => {
    const p = params();
    const qs = filtersToSearchParams(p.filters, {
      page: p.page,
      pageSize: p.pageSize,
      sort: p.sort,
      order: p.order,
    });
    return {
      queryKey: ["sales-price-batch", p],
      enabled: p.enabled,
      queryFn: async () => {
        const res = await apiFetch<PriceBatchLineRow[]>(`/api/v1/sales/price-batch/lines?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load price batch lines");
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

export function useInvalidatePriceBatchLines() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["sales-price-batch"] });
}

export async function patchPriceBatchLines(lines: { line_id: number; unit_non_vat: number }[]) {
  return apiFetch<{ updated_count: number }>("/api/v1/sales/price-batch/lines", {
    method: "PATCH",
    body: JSON.stringify({ lines }),
  });
}
