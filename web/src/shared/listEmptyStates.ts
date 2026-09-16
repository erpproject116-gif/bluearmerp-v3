/**
 * What a list says when it has nothing in it.
 *
 * The shared default used to be "No rows yet. Press F2 to create one." That
 * assumes the reader knows what a row is and that F2 does something. For a
 * first-time user an empty list is the moment they most need to be told where
 * they are in the buy or sell chain and what to do next.
 *
 * Resolved by route so individual list screens need no changes.
 */
export type ListEmptyState = {
  /** Plain statement of what is missing. */
  headline: string;
  /** The next action, and how this screen connects to the rest of the chain. */
  nextStep: string;
};

const BY_PATH: { match: RegExp; state: ListEmptyState }[] = [
  {
    match: /^\/app\/sales\/sales(\/|$)/,
    state: {
      headline: "No sales yet.",
      nextStep:
        "Choose New Sales to bill a customer and take the items out of stock. If the customer already agreed to an order, start from Sales Order instead and the details carry over.",
    },
  },
  {
    match: /^\/app\/purchases\/purchase-receive(\/|$)/,
    state: {
      headline: "No purchases yet.",
      nextStep:
        "Choose New Purchases to take stock in and record what you owe the supplier. Confirming a purchase order first fills most of this in for you.",
    },
  },
  {
    match: /^\/app\/quotation\/quotations(\/|$)/,
    state: {
      headline: "No quotations yet.",
      nextStep:
        "Choose New to price up work for a customer. Once the customer accepts, the quotation becomes a sales order.",
    },
  },
  {
    match: /^\/app\/sales-order\/sales-orders(\/|$)/,
    state: {
      headline: "No sales orders yet.",
      nextStep:
        "Choose New to record what a customer has agreed to buy. When you deliver it, the order becomes a sale.",
    },
  },
  {
    match: /^\/app\/purchase-order\/purchase-orders(\/|$)/,
    state: {
      headline: "No purchase orders yet.",
      nextStep:
        "Choose New to order stock from a supplier. Confirm the order and it becomes available to receive under Purchases. New orders start as Unconfirmed drafts — if the list looks empty, set Progress and Fulfillment back to All (Open POs only shows confirmed ones).",
    },
  },
  {
    match: /^\/app\/finance\/receivables(\/|$)/,
    state: {
      headline: "Nothing is outstanding from customers.",
      nextStep:
        "Amounts appear here on their own once you issue a sale. To collect one, open it and record an Official Receipt for the money received.",
    },
  },
  {
    match: /^\/app\/finance\/payables(\/|$)/,
    state: {
      headline: "You do not owe any supplier right now.",
      nextStep:
        "Amounts appear here on their own once you save a purchase. To settle one, open it and record a Payment Voucher for the money paid.",
    },
  },
  {
    match: /^\/app\/inventory\/items(\/|$)/,
    state: {
      headline: "No items yet.",
      nextStep:
        "Choose New to add the first thing you buy or sell. Give every item a base unit, such as piece or box, otherwise purchases and stock movements will refuse to save.",
    },
  },
  {
    match: /^\/app\/inventory\/partners(\/|$)/,
    state: {
      headline: "No customers or vendors yet.",
      nextStep:
        "Choose New to add the first one. Customers appear when you sell, vendors appear when you buy, and a sale or purchase cannot be saved without one.",
    },
  },
];

export function resolveListEmptyState(pathname: string): ListEmptyState | undefined {
  const clean = pathname.replace(/\/+$/, "") || "/";
  return BY_PATH.find((e) => e.match.test(clean))?.state;
}
