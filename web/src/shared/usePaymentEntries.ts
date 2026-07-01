import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type PaymentEntry = {
  entry_type: "official_receipt" | "payment_voucher";
  id: number;
  entry_date: string;
  document_no: string;
  partner_name: string;
  payment_method: string;
  reference_no?: string;
  amount: number;
  direction: "inbound" | "outbound";
};

export function usePaymentEntries(params: () => { page: number; pageSize: number }) {
  return createQuery(() => {
    const p = params();
    const qs = new URLSearchParams({ page: String(p.page), pageSize: String(p.pageSize) });
    return {
      queryKey: ["finance-payment-entries", p],
      queryFn: async () => {
        const res = await apiFetch<PaymentEntry[]>(`/api/v1/finance/payment-entries?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load payment entries");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 15_000,
    };
  });
}
