/** ERP shorthand → extra search terms (lowercase). */
const SYNONYM_MAP: Record<string, string[]> = {
  gr: ["goods receipt", "receive", "goodsreceipt"],
  si: ["sales invoice", "invoice", "sale"],
  so: ["sales order", "salesorder"],
  po: ["purchase order", "purchaseorder"],
  pr: ["purchase request", "purchaserequest"],
  rfq: ["request for quotation", "supplier quotation", "boq", "bill of quantities"],
  dr: ["delivery receipt", "delivery note", "delivery"],
  pos: ["point of sale", "checkout", "shift"],
  ap: ["accounts payable", "supplier invoice", "payment voucher"],
  ar: ["accounts receivable", "collection", "official receipt"],
  or: ["official receipt", "cash in", "collection", "receipt"],
  cv: ["payment voucher", "cash payment", "voucher"],
  pv: ["payment voucher", "cash payment", "voucher"],
  coa: ["chart of accounts", "general ledger", "gl accounts", "accounts"],
  loadslip: ["load slip", "loadslip"],
  hold: ["sales hold", "park invoice", "hold list"],
  capa: ["corrective action", "preventive action", "ncr", "quality"],
  ncr: ["non conformance", "nonconformance", "capa", "quality"],
  today: ["calendar", "day view", "hourly", "operations calendar"],
  serial: ["serial number", "serial unit", "barcode", "track serial"],
  lot: ["lot batch", "batch", "track lot", "expiry", "fefo"],
  return: ["sales return", "credit", "restore"],
  quotation: ["quote", "quoting", "price offer"],
  onboard: ["onboarding", "setup", "playbook", "first week"],
  confirm: ["cannot confirm", "blocked", "attachment", "required fields"],
  gmail: ["communications", "email", "smtp", "inbox"],
  pack: ["operations pack", "industry pack", "kanban columns"],
  payroll: ["hr", "employees", "salary"],
  bom: ["bill of materials", "manufacturing", "work order"],
};

export function synonymsFor(token: string): string[] {
  return SYNONYM_MAP[token] ?? [];
}
