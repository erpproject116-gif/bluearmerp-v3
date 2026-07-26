import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type RepairOrderListParams = {
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  q?: string;
  progressStatus?: string;
};

export type RepairOrderRow = {
  id: number;
  order_date: string;
  date_seq: number;
  date_no_display: string;
  repair_order_no: string;
  customer_name: string;
  pic_name: string;
  scheduled_completion_date?: string | null;
  latest_update?: string | null;
  progress_status: string;
};

export function useRepairOrderList(params: () => RepairOrderListParams) {
  return createQuery(() => {
    const p = params();
    const qs = new URLSearchParams({
      page: String(p.page),
      pageSize: String(p.pageSize),
      sort: p.sort,
      order: p.order,
    });
    if (p.q) qs.set("q", p.q);
    if (p.progressStatus) qs.set("progress_status", p.progressStatus);

    return {
      queryKey: ["repair-orders", p],
      queryFn: async () => {
        const res = await apiFetch<RepairOrderRow[]>(`/api/v1/inventory/repair-orders?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load");
        return {
          rows: res.data ?? [],
          total: res.meta?.total ?? 0,
          page: res.meta?.page ?? p.page,
          perPage: res.meta?.per_page ?? p.pageSize,
        };
      },
      placeholderData: (prev) => prev,
    };
  });
}

export function useInvalidateRepairOrders() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["repair-orders"] });
}
