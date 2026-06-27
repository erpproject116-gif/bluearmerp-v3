import { apiFetch } from "../../../shared/api";
import type { PurchaseRequestDetail } from "./PurchaseRequestModal";

export type PrintParty = {
  company_name: string;
  address?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
};

export type PurchaseRequestPrintPayload = {
  tenant: PrintParty;
  partner: PrintParty;
  purchase_request: PurchaseRequestDetail;
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

export async function fetchPurchaseRequestPrint(purchaseRequestId: number) {
  return apiFetch<PurchaseRequestPrintPayload>(`/api/v1/purchase-request/purchase-requests/${purchaseRequestId}/print`);
}

export function openPurchaseRequestPrint(purchaseRequestId: number) {
  window.open(`/app/purchase-request/purchase-requests/${purchaseRequestId}/print`, "_blank", "noopener,noreferrer");
}
