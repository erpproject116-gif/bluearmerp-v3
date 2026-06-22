import { apiFetch } from "../../../shared/api";
import type { QuotationDetail } from "./QuotationModal";

export type PrintParty = {
  company_name: string;
  address?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
};

export type QuotationPrintPayload = {
  tenant: PrintParty;
  partner: PrintParty;
  quotation: QuotationDetail;
};

export function formatPrintDate(iso?: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${m}/${d}/${y}`;
}

export function formatMoney(amount: number, currencyCode?: string): string {
  const formatted = amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currencyCode ? `${currencyCode} ${formatted}` : formatted;
}

export function partyContact(p: PrintParty): string {
  const parts = [p.phone, p.mobile, p.email].filter(Boolean);
  return parts.join(" · ") || "—";
}

export async function fetchQuotationPrint(quotationId: number) {
  return apiFetch<QuotationPrintPayload>(`/api/v1/quotation/quotations/${quotationId}/print`);
}

export function openQuotationPrint(quotationId: number) {
  window.open(`/app/quotation/quotations/${quotationId}/print`, "_blank", "noopener,noreferrer");
}
