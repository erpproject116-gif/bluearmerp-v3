/** ERP shorthand → extra search terms (lowercase). */
const SYNONYM_MAP: Record<string, string[]> = {
  gr: ["goods receipt", "receive", "goodsreceipt"],
  si: ["sales invoice", "invoice"],
  so: ["sales order", "salesorder"],
  po: ["purchase order", "purchaseorder"],
  pr: ["purchase request", "purchaserequest"],
  rfq: ["request for quotation", "supplier quotation", "boq", "bill of quantities"],
  dr: ["delivery receipt", "delivery note", "delivery"],
  pos: ["point of sale", "checkout", "shift"],
  ap: ["accounts payable", "supplier invoice", "payment voucher"],
  ar: ["accounts receivable", "collection", "official receipt"],
  serial: ["serial number", "serial unit", "barcode", "track serial"],
  lot: ["lot batch", "batch", "track lot", "expiry"],
  return: ["sales return", "credit", "restore"],
  quotation: ["quote", "quoting", "price offer"],
  onboard: ["onboarding", "setup", "playbook", "first week"],
};

export function synonymsFor(token: string): string[] {
  return SYNONYM_MAP[token] ?? [];
}
