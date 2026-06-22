import { apiFetch } from "../../../shared/api";
import type { SalesDetail } from "./salesTypes";

export type PrintParty = {
  company_name: string;
  address?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
};

export type SalesPrintPayload = {
  tenant: PrintParty;
  partner: PrintParty;
  sales: SalesDetail;
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

export async function fetchSalesPrint(salesId: number) {
  return apiFetch<SalesPrintPayload>(`/api/v1/sales/${salesId}/print`);
}

export function openSalesPrint(salesId: number) {
  window.open(`/app/sales/sales/${salesId}/print`, "_blank", "noopener,noreferrer");
}
