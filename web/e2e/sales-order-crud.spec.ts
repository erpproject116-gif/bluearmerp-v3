import { defineDocCrudSpec } from "./helpers/docCrud";

defineDocCrudSpec({
  name: "sales-order",
  listPath: "/app/sales-order/sales-orders",
  newHeading: /New Sales Order/i,
  editHeading: /Edit Sales Order/i,
  partnerLabel: /Customer/i,
  locationLabel: /Location-Out|Location/i,
  dateLabel: /^Date/i,
  notesLabel: /^Notes/i,
  withLines: true,
});
