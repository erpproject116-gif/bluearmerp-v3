import { defineDocCrudSpec } from "./helpers/docCrud";

defineDocCrudSpec({
  name: "purchase",
  listPath: "/app/purchases/purchase-receive",
  newHeading: /New Purchases|New Purchase Invoice/i,
  editHeading: /Edit Purchases|Edit Purchase Invoice/i,
  partnerLabel: /Vendor|Supplier/i,
  supplier: true,
  locationLabel: /Location/i,
  dateLabel: /Invoice date|^Date/i,
  notesLabel: /^Notes/i,
  withLines: true,
});
