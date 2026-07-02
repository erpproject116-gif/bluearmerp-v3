import { apiFetch } from "../../../shared/api";

export type Bir2307PrintPayload = {
  certificate_no: string;
  payment_date: string;
  payment_no: string;
  date_no_display: string;
  payor: { company_name: string; tin?: string | null; address?: string | null; phone?: string | null; email?: string | null };
  payee: { company_name: string; tin?: string | null; address?: string | null; phone?: string | null; email?: string | null };
  lines: {
    code: string;
    description: string;
    rate_pct: number;
    base_amount: number;
    tax_amount: number;
  }[];
  total_base: number;
  total_tax: number;
};

export function fetchBir2307Print(paymentVoucherId: number) {
  return apiFetch<Bir2307PrintPayload>(`/api/v1/finance/payment-vouchers/${paymentVoucherId}/print-2307`);
}

export function formatMoney(n: number) {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatPrintDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
}
