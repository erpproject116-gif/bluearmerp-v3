import { apiFetch } from "../../../shared/api";
import { formatMoney, formatPrintDate, type PrintParty } from "../../purchase-request/purchase-request/purchaseRequestPrint";

export type VendorCreditLine = {
  line_no: number;
  item_code?: string;
  item_name?: string;
  qty?: number;
  unit_price?: number;
  tax_amount?: number;
  amount?: number;
};

export type VendorCreditDetail = {
  id: number;
  credit_date: string;
  credit_no: string;
  vendor_name: string;
  amount_total: number;
  remaining_amount: number;
  status: string;
  reason: string;
  notes: string;
  lines?: VendorCreditLine[];
};

export type VendorCreditPrintPayload = {
  tenant: PrintParty;
  partner: PrintParty;
  vendor_credit: VendorCreditDetail;
};

export async function fetchVendorCreditPrint(id: number) {
  return apiFetch<VendorCreditPrintPayload>(`/api/v1/finance/vendor-credits/${id}/print`);
}

export function openVendorCreditPrint(id: number) {
  window.open(`/app/purchases/vendor-credits/${id}/print`, "_blank", "noopener,noreferrer");
}

export { formatMoney, formatPrintDate };
