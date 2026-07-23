import { apiFetch } from "../../../shared/api";
import { formatMoneyWithCode } from "../../../shared/money";
import type { SalesOrderDetail } from "./SalesOrderModal";

export type PrintParty = {
  company_name: string;
  address?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
};

export type SalesOrderPrintPayload = {
  tenant: PrintParty;
  partner: PrintParty;
  sales_order: SalesOrderDetail;
};

export function formatPrintDate(iso?: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${m}/${d}/${y}`;
}

export function formatMoney(amount: number, currencyCode?: string): string {
  return formatMoneyWithCode(amount, currencyCode);
}

export function partyContact(p: PrintParty): string {
  const parts = [p.phone, p.mobile, p.email].filter(Boolean);
  return parts.join(" · ") || "—";
}

export async function fetchSalesOrderPrint(salesOrderId: number) {
  return apiFetch<SalesOrderPrintPayload>(`/api/v1/sales-order/sales-orders/${salesOrderId}/print`);
}

export function openSalesOrderPrint(salesOrderId: number) {
  window.open(`/app/sales-order/sales-orders/${salesOrderId}/print`, "_blank", "noopener,noreferrer");
}
