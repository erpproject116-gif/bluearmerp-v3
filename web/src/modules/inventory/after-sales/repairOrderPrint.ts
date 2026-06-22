import { apiFetch } from "../../../shared/api";
import type { RepairOrderDetail } from "./RepairOrderModal";

export type PrintParty = {
  company_name: string;
  address?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
};

export type RepairOrderPrintPayload = {
  doc_type: "receipt" | "warranty";
  tenant: PrintParty;
  partner: PrintParty;
  order: RepairOrderDetail;
};

export function lineAmount(line: { service_charge?: number | null; qty?: number }): number {
  const charge = line.service_charge ?? 0;
  const qty = line.qty && line.qty > 0 ? line.qty : 1;
  return charge * qty;
}

export function orderLineTotal(lines: RepairOrderPrintPayload["order"]["lines"]): number {
  return (lines ?? []).reduce((sum, ln) => sum + lineAmount(ln), 0);
}

export function formatPrintDate(iso?: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${m}/${d}/${y}`;
}

export function formatMoney(amount: number): string {
  return amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function partyContact(p: PrintParty): string {
  const parts = [p.phone, p.mobile, p.email].filter(Boolean);
  return parts.join(" · ") || "—";
}

export async function fetchRepairOrderPrint(orderId: number, doc: "receipt" | "warranty") {
  return apiFetch<RepairOrderPrintPayload>(
    `/api/v1/inventory/repair-orders/${orderId}/print?doc=${doc}`,
  );
}

export function openRepairOrderPrint(orderId: number, doc: "receipt" | "warranty") {
  const path =
    doc === "receipt"
      ? `/app/inventory/after-sales/repair-orders/${orderId}/receipt`
      : `/app/inventory/after-sales/repair-orders/${orderId}/warranty`;
  window.open(path, "_blank", "noopener,noreferrer");
}
