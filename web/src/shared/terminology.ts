// Central plain-language copy for the Selling / Buying / POS flows.
// Goal: use everyday words for non-technical staff, while keeping legally/accounting
// required terms (VAT, Official Receipt, Withholding) and pairing them with a short hint.
//
// Prefer importing TERMS here (or the <TermHint> component) instead of scattering copy
// so wording can be adjusted in one place.

export type Term = {
  /** Plain, user-facing label. */
  label: string;
  /** Optional one-line explanation shown as a tooltip/help text. */
  hint?: string;
};

export const TERMS = {
  // Selling chain
  quotation: { label: "Quotation", hint: "A price quote you send to a customer. Not yet a sale." },
  sales_order: { label: "Sales Order", hint: "An upcoming sale the customer committed to. Not revenue yet." },
  sales: { label: "Sales", hint: "The actual sale - this is your revenue." },
  delivery_receipt: { label: "Delivery Slip", hint: "Proof that items were delivered to the customer." },

  // Buying chain
  purchase_request: { label: "Purchase Request", hint: "An internal request to buy something. Not an order yet." },
  purchase_order: { label: "Purchase Order", hint: "The order you send to a supplier. A commitment, not an expense yet." },
  goods_receipt: {
    label: "Purchase Receive",
    hint: "Legacy stock-in document. Prefer New Bill to post stock and serials on confirm.",
  },
  supplier_invoice: {
    label: "Bill",
    hint: "New Purchase: amount owed, stock, and serials when you confirm (Load Slip from PO or blank).",
  },
  payment_voucher: { label: "Payment Made", hint: "Pay the vendor and clear accounts payable." },
  rfq: { label: "Request for Quote", hint: "Ask suppliers for their prices before ordering." },

  // Accounting terms to KEEP but explain
  vat: { label: "VAT", hint: "Value-Added Tax - a 12% government tax added to the price." },
  non_vat: { label: "Non-VAT", hint: "No value-added tax is applied to this line." },
  vat_inclusive: { label: "VAT-inclusive", hint: "The price already includes VAT." },
  official_receipt: { label: "Official Receipt", hint: "The BIR-registered receipt issued when a customer pays." },
  withholding_tax: { label: "Withholding Tax", hint: "Tax withheld from a payment and remitted to the BIR." },
  ar: { label: "A/R", hint: "Accounts Receivable - money customers owe you." },
  ap: { label: "A/P", hint: "Accounts Payable - money you owe suppliers." },

  // Generic UI wording
  tax_treatment: { label: "Tax treatment", hint: "How tax is applied to this document (e.g. VAT-inclusive or Non-VAT)." },
  items: { label: "Items", hint: "The products/services on this document." },
  reference: { label: "Reference", hint: "Your own reference number for this document." },
  date_no: { label: "Date & No.", hint: "The document's date and its running number for that day." },
} satisfies Record<string, Term>;

export type TermKey = keyof typeof TERMS;

export function termLabel(key: TermKey): string {
  return TERMS[key].label;
}

export function termHint(key: TermKey): string | undefined {
  return TERMS[key].hint;
}
