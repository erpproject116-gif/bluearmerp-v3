import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "./api";

export type PaymentVoucherRow = {
  id: number;
  payment_date: string;
  date_no_display: string;
  payment_no: string;
  partner_id: number;
  vendor_name: string;
  currency_code: string;
  payment_method: string;
  reference_no?: string | null;
  amount_total: number;
};

export type PaymentApplication = {
  supplier_invoice_id: number;
  invoice_no?: string;
  date_no_display?: string;
  grand_total?: number;
  applied_amount: number;
};

export type PaymentVoucherDetail = PaymentVoucherRow & {
  currency_id: number;
  reference_no?: string | null;
  notes?: string | null;
  applications?: PaymentApplication[];
};

export function usePaymentVoucherList(params: () => { page: number; pageSize: number; sort: string; order: "asc" | "desc"; q?: string }) {
  return createQuery(() => {
    const p = params();
    const qs = new URLSearchParams({ page: String(p.page), pageSize: String(p.pageSize), sort: p.sort, order: p.order });
    if (p.q) qs.set("q", p.q);
    return {
      queryKey: ["payment-vouchers", p],
      queryFn: async () => {
        const res = await apiFetch<PaymentVoucherRow[]>(`/api/v1/finance/payment-vouchers?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
      staleTime: 30_000,
      placeholderData: (prev) => prev,
    };
  });
}

export function useInvalidatePaymentVouchers() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["payment-vouchers"] });
}
