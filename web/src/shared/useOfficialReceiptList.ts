import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type OfficialReceiptListParams = {
  page: number;
  pageSize: number;
  sort: string;
  order: "asc" | "desc";
  q?: string;
  paymentMethod?: string;
  partnerId?: number;
};

export type OfficialReceiptRow = {
  id: number;
  receipt_date: string;
  date_seq: number;
  date_no_display: string;
  receipt_no: string;
  partner_id: number;
  customer_name: string;
  currency_id: number;
  currency_code: string;
  payment_method: string;
  reference_no?: string | null;
  amount_total: number;
  created_by_name?: string;
};

export type ReceiptApplication = {
  id?: number;
  sales_id: number;
  sales_no?: string;
  date_no_display?: string;
  grand_total?: number;
  applied_amount: number;
  outstanding_amount?: number;
};

export type OfficialReceiptDetail = {
  id: number;
  receipt_date: string;
  date_seq: number;
  date_no_display: string;
  receipt_no: string;
  partner_id: number;
  customer_name: string;
  currency_id: number;
  currency_code?: string;
  payment_method: string;
  reference_no?: string | null;
  notes?: string | null;
  amount_total: number;
  created_by_name?: string;
  applications?: ReceiptApplication[];
};

export function useOfficialReceiptList(params: () => OfficialReceiptListParams) {
  return createQuery(() => {
    const p = params();
    const qs = new URLSearchParams({
      page: String(p.page),
      pageSize: String(p.pageSize),
      sort: p.sort,
      order: p.order,
    });
    if (p.q) qs.set("q", p.q);
    if (p.paymentMethod) qs.set("payment_method", p.paymentMethod);
    if (p.partnerId) qs.set("partner_id", String(p.partnerId));

    return {
      queryKey: ["official-receipts", p],
      queryFn: async () => {
        const res = await apiFetch<OfficialReceiptRow[]>(`/api/v1/finance/official-receipts?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load");
        return {
          rows: res.data ?? [],
          total: res.meta?.total ?? 0,
          page: res.meta?.page ?? p.page,
          perPage: res.meta?.per_page ?? p.pageSize,
        };
      },
      staleTime: 0,
      placeholderData: (prev) => prev,
    };
  });
}

export function useInvalidateOfficialReceipts() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["official-receipts"] });
}

export async function deleteOfficialReceipt(id: number) {
  return apiFetch(`/api/v1/finance/official-receipts/${id}`, { method: "DELETE" });
}
