import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type DeliveryReceiptListParams = {
  page: number;
  pageSize: number;
  sort?: string;
  order?: string;
  q?: string;
  status?: string;
};

export type DeliveryReceiptRow = {
  id: number;
  date_no_display: string;
  delivery_no: string;
  status: string;
  partner_name: string;
  sales_order_no?: string;
};

export type OpenDeliveryLine = {
  sales_order_id: number;
  sales_order_line_id: number;
  sales_order_release_line_id?: number;
  date_no_display: string;
  sales_order_no: string;
  customer_name: string;
  item_code: string;
  item_name: string;
  released_qty: number;
  delivered_qty: number;
  balance_qty: number;
};

export function useDeliveryReceiptList(params: () => DeliveryReceiptListParams) {
  return useQuery(() => {
    const p = params();
    const qs = new URLSearchParams({
      page: String(p.page),
      pageSize: String(p.pageSize),
      sort: p.sort ?? "delivery_date",
      order: p.order ?? "desc",
    });
    if (p.q) qs.set("q", p.q);
    if (p.status) qs.set("status", p.status);
    return {
      queryKey: ["delivery-receipts", p],
      queryFn: async () => {
        const res = await apiFetch<DeliveryReceiptRow[]>(`/api/v1/sales-order/delivery-receipts?${qs}`);
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      placeholderData: (prev) => prev,
    };
  });
}

export function useOpenDeliveryLines(enabled: () => boolean) {
  return useQuery(() => ({
    queryKey: ["delivery-receipts-open-lines"],
    enabled: enabled(),
    queryFn: async () => {
      const qs = new URLSearchParams({ page: "1", pageSize: "100" });
      const res = await apiFetch<OpenDeliveryLine[]>(`/api/v1/sales-order/delivery-receipts/open-lines?${qs}`);
      return res.data ?? [];
    },
  }));
}

export function useInvalidateDeliveryReceipts() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: ["delivery-receipts"] });
    void client.invalidateQueries({ queryKey: ["delivery-receipts-open-lines"] });
  };
}
