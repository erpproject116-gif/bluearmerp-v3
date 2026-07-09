import { apiFetch } from "../../../shared/api";
import { formatMoney, formatPrintDate, partyContact, type PrintParty } from "../purchase-request/purchaseRequestPrint";

export type SupplierQuotationLine = {
  line_no: number;
  item_code: string;
  item_name: string;
  qty: number;
  unit_price: number;
  line_total: number;
};

export type SupplierQuotationDetail = {
  id: number;
  quote_no: string;
  quote_date: string;
  status: string;
  valid_until?: string | null;
  notes?: string | null;
  grand_total: number;
  lines?: SupplierQuotationLine[];
};

export type SupplierQuotationPrintPayload = {
  tenant: PrintParty;
  partner: PrintParty;
  supplier_quotation: SupplierQuotationDetail;
};

export async function fetchSupplierQuotationPrint(id: number) {
  return apiFetch<SupplierQuotationPrintPayload>(`/api/v1/purchase-order/supplier-quotations/${id}/print`);
}

export function openSupplierQuotationPrint(id: number) {
  window.open(`/app/purchase-order/supplier-quotations/${id}/print`, "_blank", "noopener,noreferrer");
}

export { formatMoney, formatPrintDate, partyContact };
