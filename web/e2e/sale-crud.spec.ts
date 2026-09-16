import { defineDocCrudSpec } from "./helpers/docCrud";

defineDocCrudSpec({
  name: "sale",
  listPath: "/app/sales/sales",
  newHeading: /New Sales/i,
  editHeading: /Edit Sales/i,
  partnerLabel: /Customer/i,
  locationLabel: /Location/i,
  dateLabel: /^Date/i,
  notesLabel: /^Notes/i,
  withLines: true,
});
