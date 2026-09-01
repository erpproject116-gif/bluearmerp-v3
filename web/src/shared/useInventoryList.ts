import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type InventoryListParams = {
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  q?: string;
  status?: string;
  kind?: string;
  lifecycle?: string;
  item_code?: string;
  item_name?: string;
  spec_name?: string;
  item_category?: string;
  item_type?: string;
  track_serial?: string;
  track_lot?: string;
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
    if (p.kind) qs.set("kind", p.kind);
    if (p.lifecycle && p.lifecycle !== "active") qs.set("lifecycle", p.lifecycle);
    if (p.item_code) qs.set("item_code", p.item_code);
    if (p.item_name) qs.set("item_name", p.item_name);
    if (p.spec_name) qs.set("spec_name", p.spec_name);
    if (p.item_category) qs.set("item_category", p.item_category);
    if (p.item_type) qs.set("item_type", p.item_type);
    if (p.track_serial) qs.set("track_serial", p.track_serial);
    if (p.track_lot) qs.set("track_lot", p.track_lot);

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
      gcTime: 300_000,
      placeholderData: (prev: InventoryListResult<T> | undefined) => prev,
    };
  });
}

export function useInvalidateInventoryList() {
  const client = useQueryClient();
  return (entity: string) => void client.invalidateQueries({ queryKey: ["inventory", entity] });
}
