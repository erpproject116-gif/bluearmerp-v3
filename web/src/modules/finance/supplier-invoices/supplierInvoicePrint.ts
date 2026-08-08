import { apiFetch } from "../../../shared/api";
import type { SupplierInvoiceDetail } from "../../../shared/useSupplierInvoiceList";
import { formatMoney, formatPrintDate, partyContact, type PrintParty } from "../../purchase-request/purchase-request/purchaseRequestPrint";

export type SupplierInvoicePrintPayload = {
  tenant: PrintParty;
  partner: PrintParty;
  supplier_invoice: SupplierInvoiceDetail;
};

export async function fetchSupplierInvoicePrint(id: number) {
  return apiFetch<SupplierInvoicePrintPayload>(`/api/v1/finance/supplier-invoices/${id}/print`);
}

export function openSupplierInvoicePrint(id: number) {
  window.open(`/app/purchases/purchase-receive/${id}/print`, "_blank", "noopener,noreferrer");
}

export { formatMoney, formatPrintDate, partyContact };
