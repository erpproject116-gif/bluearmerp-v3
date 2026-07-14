import { defineDocCrudSpec } from "./helpers/docCrud";

defineDocCrudSpec({
  name: "quotation",
  listPath: "/app/quotation/quotations",
  newHeading: /New Quotation/i,
  editHeading: /Edit Quotation/i,
  partnerLabel: /Customer/i,
  partnerQuery: "Seda",
  locationLabel: /Location-Out|Location/i,
  locationQuery: "Head",
  dateLabel: /^Date/i,
  notesLabel: /^Notes/i,
  withLines: true,
  itemQuery: "Sofa",
});
