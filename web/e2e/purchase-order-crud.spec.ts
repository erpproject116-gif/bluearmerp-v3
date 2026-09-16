import { defineDocCrudSpec } from "./helpers/docCrud";

defineDocCrudSpec({
  name: "purchase-order",
  listPath: "/app/purchase-order/purchase-orders",
  newHeading: /New Purchase Order/i,
  editHeading: /Purchase Order/i,
  partnerLabel: /Supplier/i,
  supplier: true,
  locationLabel: /Location/i,
  dateLabel: /^Date|Order date|PO date/i,
  notesLabel: /^Notes/i,
  withLines: true,
});
