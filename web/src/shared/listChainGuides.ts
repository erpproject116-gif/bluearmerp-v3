/**
 * Where am I, and what happens next?
 *
 * The create/edit modals already explain themselves through MODAL_FORM_GUIDES,
 * but the list screens a user lands on first said nothing. Someone who opens
 * "Sales Order" has no way to tell whether it bills the customer, moves stock,
 * or neither, and nothing tells them the order becomes a sale later.
 *
 * Same shape as a modal guide so the existing ModalFormGuide component renders
 * it, which keeps the collapse, the remembered state, and the global guides
 * toggle consistent.
 */
export type ListChainGuide = {
  id: string;
  title: string;
  summary: string;
  steps: string[];
};

const BY_PATH: { match: RegExp; guide: ListChainGuide }[] = [
  {
    match: /^\/app\/quotation\/quotations(\/|$)/,
    guide: {
      id: "list-quotation",
      title: "Quotations: the price you offer a customer",
      summary:
        "Nothing is owed and no stock moves at this stage. A quotation only says what the work would cost.",
      steps: [
        "Step 1 of the sell chain: quote the customer.",
        "If they accept, raise a Sales Order to record the commitment.",
        "Deliver the goods with New Sales, which bills them and takes stock out.",
      ],
    },
  },
  {
    match: /^\/app\/sales-order\/sales-orders(\/|$)/,
    guide: {
      id: "list-sales-order",
      title: "Sales Orders: what the customer agreed to buy",
      summary:
        "A sales order is a promise, not a bill. No money is owed and no stock leaves until you turn it into a sale.",
      steps: [
        "Step 2 of the sell chain, usually created from an accepted quotation.",
        "When you deliver, open New Sales to bill the customer and release the stock.",
        "Collect the money under Accounts Receivable.",
      ],
    },
  },
  {
    match: /^\/app\/sales\/sales(\/|$)/,
    guide: {
      id: "list-sales",
      title: "Sales: billing the customer and releasing stock",
      summary:
        "Saving a sale does two things at once: it bills the customer and takes the items out of stock.",
      steps: [
        "Step 3 of the sell chain, the point where money and stock actually move.",
        "Start from a Sales Order to carry the details over, or sell directly.",
        "Once issued, collect payment under Accounts Receivable.",
      ],
    },
  },
  {
    match: /^\/app\/purchase-order\/purchase-orders(\/|$)/,
    guide: {
      id: "list-purchase-order",
      title: "Purchase Orders: what you have ordered from a supplier",
      summary:
        "Ordering is not receiving. Nothing enters stock and nothing is owed until the goods arrive.",
      steps: [
        "Step 1 of the buy chain: order from the supplier.",
        "Confirm the order, otherwise it will not appear when you try to receive it.",
        "When the goods arrive, use New Purchases to take them into stock.",
      ],
    },
  },
  {
    match: /^\/app\/purchases\/purchase-receive(\/|$)/,
    guide: {
      id: "list-purchases",
      title: "Purchases: taking stock in and recording what you owe",
      summary:
        "Saving a purchase adds the items to stock and records the amount owed to the supplier.",
      steps: [
        "Step 2 of the buy chain, the point where stock and money actually move.",
        "A confirmed purchase order fills most of this in for you.",
        "Settle the balance under Accounts Payable.",
      ],
    },
  },
  {
    match: /^\/app\/finance\/receivables(\/|$)/,
    guide: {
      id: "list-receivables",
      title: "Accounts Receivable: money customers still owe you",
      summary:
        "Every sale you issue lands here until it is paid. The balance shown is what is outstanding, not what you have collected.",
      steps: [
        "Final step of the sell chain: collect what the sale billed.",
        "Record the money with an Official Receipt against the sale.",
        "The balance clears once the receipt covers the full amount.",
      ],
    },
  },
  {
    match: /^\/app\/finance\/payables(\/|$)/,
    guide: {
      id: "list-payables",
      title: "Accounts Payable: money you still owe suppliers",
      summary:
        "Every purchase you save lands here until you pay it. The balance shown is what is outstanding, not what you have paid.",
      steps: [
        "Final step of the buy chain: settle what the purchase recorded.",
        "Pay it with a Payment Voucher against the purchase.",
        "The balance clears once the voucher covers the full amount.",
      ],
    },
  },
  {
    match: /^\/app\/inventory\/items(\/|$)/,
    guide: {
      id: "list-items",
      title: "Items: everything you buy, make, or sell",
      summary:
        "Items feed every other screen. A gap here shows up much later as a document that refuses to save.",
      steps: [
        "Give every item a base unit, such as piece or box.",
        "Without a base unit, purchases and stock movements will be rejected.",
        "Set prices here so quotations and sales fill them in for you.",
      ],
    },
  },
  {
    match: /^\/app\/inventory\/partners(\/|$)/,
    guide: {
      id: "list-partners",
      title: "Customers and vendors live in one list",
      summary:
        "The same screen holds both. Customers are who you sell to, vendors are who you buy from, and one company can be both.",
      steps: [
        "Use the kind filter to see only customers or only vendors.",
        "A sale needs a customer; a purchase order needs a vendor.",
        "Add them here before starting a document, or the lookup will come up empty.",
      ],
    },
  },
];

export function resolveListChainGuide(pathname: string): ListChainGuide | undefined {
  const clean = pathname.replace(/\/+$/, "") || "/";
  return BY_PATH.find((e) => e.match.test(clean))?.guide;
}
