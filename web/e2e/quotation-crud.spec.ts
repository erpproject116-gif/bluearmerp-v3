import { defineDocCrudSpec } from "./helpers/docCrud";

defineDocCrudSpec({
  name: "quotation",
  listPath: "/app/quotation/quotations",
  newHeading: /New Quotation/i,
  editHeading: /Edit Quotation/i,
  partnerLabel: /Customer/i,
  locationLabel: /Location-Out|Location/i,
  dateLabel: /^Date/i,
  notesLabel: /^Notes/i,
  withLines: true,
});
