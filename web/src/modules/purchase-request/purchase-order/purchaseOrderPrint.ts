import { apiFetch } from "../../../shared/api";
import type { PurchaseOrderDetail } from "../purchase-order/PurchaseOrderModal";
import {
  formatMoney,
  formatPrintDate,
  partyContact,
  type PrintParty,
} from "../purchase-request/purchaseRequestPrint";

export type { PrintParty };
export { formatMoney, formatPrintDate, partyContact };

export type PurchaseOrderPrintPayload = {
  tenant: PrintParty;
  partner: PrintParty;
  purchase_order: PurchaseOrderDetail;
};

export async function fetchPurchaseOrderPrint(purchaseOrderId: number) {
  return apiFetch<PurchaseOrderPrintPayload>(`/api/v1/purchase-order/purchase-orders/${purchaseOrderId}/print`);
}

export function openPurchaseOrderPrint(purchaseOrderId: number) {
  window.open(`/app/purchase-order/purchase-orders/${purchaseOrderId}/print`, "_blank", "noopener,noreferrer");
}
