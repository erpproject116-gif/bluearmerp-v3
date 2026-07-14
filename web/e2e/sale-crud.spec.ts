import { defineDocCrudSpec } from "./helpers/docCrud";

defineDocCrudSpec({
  name: "sale",
  listPath: "/app/sales/sales",
  newHeading: /New Sale/i,
  editHeading: /Edit Sale/i,
  partnerLabel: /Customer/i,
  partnerQuery: "Seda",
  locationLabel: /Location/i,
  locationQuery: "Head",
  dateLabel: /^Date/i,
  notesLabel: /^Notes/i,
  withLines: true,
  itemQuery: "Sofa",
});
