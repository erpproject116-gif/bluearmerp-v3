import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type TaxTypeListParams = {
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  q?: string;
  status?: string;
};

export type TaxTypeRow = {
  id: number;
  tax_code: string;
  name: string;
  tax_mode: string;
  rate_percent: number;
  formula_json?: Record<string, unknown>;
  sort_order: number;
  status: string;
};

export function useTaxTypeList(params: () => TaxTypeListParams) {
  return createQuery(() => {
    const p = params();
    const qs = new URLSearchParams({
      page: String(p.page),
      pageSize: String(p.pageSize),
      sort: p.sort,
      order: p.order,
    });
    if (p.q) qs.set("q", p.q);
    if (p.status) qs.set("status", p.status);

    return {
      queryKey: ["quotation-tax-types", p],
      queryFn: async () => {
        const res = await apiFetch<TaxTypeRow[]>(`/api/v1/quotation/tax-types?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load");
        return {
          rows: res.data ?? [],
          total: res.meta?.total ?? 0,
          page: res.meta?.page ?? p.page,
          perPage: res.meta?.per_page ?? p.pageSize,
        };
      },
      staleTime: 30_000,
    };
  });
}

export function useInvalidateTaxTypes() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["quotation-tax-types"] });
}
