import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type ReleaseQueueParams = {
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  q?: string;
};

export type ReleaseQueueRow = {
  sales_order_id: number;
  sales_order_line_id: number;
  date_no_display: string;
  sales_order_no: string;
  progress_status: string;
  customer_name: string;
  location_id: number;
  location_name: string;
  item_id?: number | null;
  item_code: string;
  item_name: string;
  order_qty: number;
  balance_qty: number;
  location_stock: number;
  track_inventory_qty: boolean;
};

export function useReleaseQueue(params: () => ReleaseQueueParams) {
  return createQuery(() => {
    const p = params();
    const qs = new URLSearchParams({
      page: String(p.page),
      pageSize: String(p.pageSize),
      sort: p.sort,
      order: p.order,
    });
    if (p.q) qs.set("q", p.q);

    return {
      queryKey: ["sales-order-release-queue", p],
      queryFn: async () => {
        const res = await apiFetch<ReleaseQueueRow[]>(`/api/v1/sales-order/sales-orders/release-queue?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load release queue");
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

export function useInvalidateReleaseQueue() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["sales-order-release-queue"] });
}

export async function postSalesOrderReleases(lines: Array<{ sales_order_line_id: number; release_qty: number }>) {
  return apiFetch<{ released_count: number }>("/api/v1/sales-order/sales-orders/releases", {
    method: "POST",
    body: JSON.stringify({ lines }),
  }, { silent: true });
}
