import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type GoodsReceiptListParams = {
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  q?: string;
  status?: string;
  purchase_order_id?: number;
};

export type GoodsReceiptRow = {
  id: number;
  purchase_order_id: number;
  purchase_order_no?: string;
  receipt_date: string;
  location_id: number;
  location_name?: string;
  status: string;
  inspection_status?: string;
  inspection_notes?: string | null;
  reference?: string | null;
  notes?: string | null;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
};

export function useGoodsReceiptList(params: () => GoodsReceiptListParams) {
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
    if (p.purchase_order_id) qs.set("purchase_order_id", String(p.purchase_order_id));

    return {
      queryKey: ["goods-receipts", p],
      queryFn: async () => {
        const res = await apiFetch<GoodsReceiptRow[]>(`/api/v1/goods-receipt/goods-receipts?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load goods receipts");
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

export function useInvalidateGoodsReceipts() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["goods-receipts"] });
}
