import { apiFetch } from "../../../shared/api";
import { formatMoney, formatPrintDate, type PrintParty } from "../../purchase-request/purchase-request/purchaseRequestPrint";

export type CreditNoteLine = {
  line_no: number;
  item_code?: string;
  item_name?: string;
  qty?: number;
  unit_price?: number;
  tax_amount?: number;
  amount?: number;
};

export type CreditNoteDetail = {
  id: number;
  credit_date: string;
  credit_no: string;
  customer_name: string;
  amount_total: number;
  remaining_amount: number;
  status: string;
  reason: string;
  notes: string;
  lines?: CreditNoteLine[];
};

export type CreditNotePrintPayload = {
  tenant: PrintParty;
  partner: PrintParty;
  credit_note: CreditNoteDetail;
};

export async function fetchCreditNotePrint(id: number) {
  return apiFetch<CreditNotePrintPayload>(`/api/v1/finance/credit-notes/${id}/print`);
}

export function openCreditNotePrint(id: number) {
  window.open(`/app/sales/credit-notes/${id}/print`, "_blank", "noopener,noreferrer");
}

export { formatMoney, formatPrintDate };
