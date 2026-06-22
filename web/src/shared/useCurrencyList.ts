import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type CurrencyListParams = {
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  q?: string;
  status?: string;
};

export type CurrencyRow = {
  id: number;
  currency_code: string;
  name: string;
  is_default: boolean;
  status: string;
};

export function useCurrencyList(params: () => CurrencyListParams) {
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
      queryKey: ["quotation-currencies", p],
      queryFn: async () => {
        const res = await apiFetch<CurrencyRow[]>(`/api/v1/quotation/currencies?${qs}`);
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

export function useInvalidateCurrencies() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["quotation-currencies"] });
}
