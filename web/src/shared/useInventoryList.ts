import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type InventoryListParams = {
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  q?: string;
  status?: string;
};

export type InventoryListResult<T> = {
  rows: T[];
  total: number;
  page: number;
  perPage: number;
};

export function useInventoryList<T>(entity: string, params: () => InventoryListParams) {
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
      queryKey: ["inventory", entity, p],
      queryFn: async (): Promise<InventoryListResult<T>> => {
        const res = await apiFetch<T[]>(`/api/v1/inventory/${entity}?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load");
        return {
          rows: res.data ?? [],
          total: res.meta?.total ?? 0,
          page: res.meta?.page ?? p.page,
          perPage: res.meta?.per_page ?? p.pageSize,
        };
      },
      staleTime: 30_000,
      gcTime: 300_000,
      placeholderData: (prev: InventoryListResult<T> | undefined) => prev,
    };
  });
}

export function useInvalidateInventoryList() {
  const client = useQueryClient();
  return (entity: string) => void client.invalidateQueries({ queryKey: ["inventory", entity] });
}
