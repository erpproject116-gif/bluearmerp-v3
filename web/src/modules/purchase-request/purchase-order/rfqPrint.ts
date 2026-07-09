import { apiFetch } from "../../../shared/api";
import { formatPrintDate, type PrintParty } from "../purchase-request/purchaseRequestPrint";

export type RfqLine = {
  line_no: number;
  item_code: string;
  item_name: string;
  qty: number;
  notes?: string | null;
};

export type RfqDetail = {
  id: number;
  rfq_no: string;
  rfq_date: string;
  status: string;
  notes?: string | null;
  lines?: RfqLine[];
};

export type RfqPrintPayload = {
  tenant: PrintParty;
  rfq: RfqDetail;
};

export async function fetchRfqPrint(rfqId: number) {
  return apiFetch<RfqPrintPayload>(`/api/v1/purchase-order/rfq/${rfqId}/print`);
}

export function openRfqPrint(rfqId: number) {
  window.open(`/app/purchase-order/rfq/${rfqId}/print`, "_blank", "noopener,noreferrer");
}

export { formatPrintDate };
