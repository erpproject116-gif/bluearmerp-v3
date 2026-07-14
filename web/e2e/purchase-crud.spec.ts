import { defineDocCrudSpec } from "./helpers/docCrud";

defineDocCrudSpec({
  name: "purchase",
  listPath: "/app/purchases/purchases",
  newHeading: /New Purchase \(actual purchase\)/i,
  editHeading: /Edit Purchase \(actual purchase\)/i,
  partnerLabel: /Vendor/i,
  partnerQuery: "Steel",
  locationLabel: /Location/i,
  locationQuery: "Head",
  dateLabel: /Invoice date|^Date/i,
  notesLabel: /^Notes/i,
  withLines: true,
  itemQuery: "Steel",
});
