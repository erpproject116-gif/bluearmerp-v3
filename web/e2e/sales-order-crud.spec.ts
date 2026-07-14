import { defineDocCrudSpec } from "./helpers/docCrud";

defineDocCrudSpec({
  name: "sales-order",
  listPath: "/app/sales-order/sales-orders",
  newHeading: /New Sales Order/i,
  editHeading: /Edit Sales Order/i,
  partnerLabel: /Customer/i,
  partnerQuery: "Seda",
  locationLabel: /Location-Out|Location/i,
  locationQuery: "Head",
  dateLabel: /^Date/i,
  notesLabel: /^Notes/i,
  withLines: true,
  itemQuery: "Sofa",
});
