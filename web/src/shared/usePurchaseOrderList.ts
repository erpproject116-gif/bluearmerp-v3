import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type PurchaseOrderListParams = {
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  q?: string;
  status?: string;
  progressStatus?: string;
  purchase_request_id?: number;
  supplier_quotation_id?: number;
  lifecycle?: string;
};

export type PurchaseOrderRow = {
  id: number;
  order_date: string;
  date_seq: number;
  date_no_display: string;
  purchase_order_no: string;
  purchase_request_id?: number | null;
  rfq_id?: number | null;
  supplier_quotation_id?: number | null;
  tax_type_id: number;
  tax_type_name: string;
  currency_id: number;
  currency_code: string;
  partner_id?: number | null;
  partner_name: string;
  pic_user_id?: number | null;
  pic_name: string;
  location_id: number;
  status: string;
  progress_status: string;
  pct_received?: number;
  pct_billed?: number;
  grand_total: number;
  created_by_name?: string;
  item_name_summary?: string;
};

export function usePurchaseOrderList(params: () => PurchaseOrderListParams) {
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
    if (p.progressStatus) qs.set("progress_status", p.progressStatus);
    if (p.purchase_request_id) qs.set("purchase_request_id", String(p.purchase_request_id));
    if (p.supplier_quotation_id) qs.set("supplier_quotation_id", String(p.supplier_quotation_id));
    if (p.lifecycle && p.lifecycle !== "active") qs.set("lifecycle", p.lifecycle);

    return {
      queryKey: ["purchase-orders", p],
      queryFn: async () => {
        const res = await apiFetch<PurchaseOrderRow[]>(`/api/v1/purchase-order/purchase-orders?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load");
        return {
          rows: res.data ?? [],
          total: res.meta?.total ?? 0,
          page: res.meta?.page ?? p.page,
          perPage: res.meta?.per_page ?? p.pageSize,
        };
      },
      staleTime: 30_000,
      placeholderData: (prev) => prev,
    };
  });
}

export function useInvalidatePurchaseOrders() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["purchase-orders"] });
}

export async function confirmPurchaseOrder(purchaseOrderId: number) {
  return apiFetch(`/api/v1/purchase-order/purchase-orders/${purchaseOrderId}/confirm`, {
    method: "PATCH",
  });
}

export async function createPurchaseOrderFromRequest(purchaseRequestId: number) {
  return apiFetch<PurchaseOrderRow>(`/api/v1/purchase-order/purchase-orders/from-purchase-request/${purchaseRequestId}`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function createPurchaseOrderFromSupplierQuotation(supplierQuotationId: number) {
  return apiFetch<PurchaseOrderRow>(
    `/api/v1/purchase-order/purchase-orders/from-supplier-quotation/${supplierQuotationId}`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}
