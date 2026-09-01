import type { FormErrors } from "./formValidation";

type LookupLabels = {
  tax_type_id?: string;
  currency_id?: string;
  partner_id?: string;
  location_id?: string;
};

/** Shared required lookup checks for selling/buying document headers. */
export function collectDocumentLookupErrors(
  values: {
    tax_type_id?: number | null;
    currency_id?: number | null;
    partner_id?: number | null;
    location_id?: number | null;
  },
  labels: LookupLabels = {},
  options?: { includePartner?: boolean },
): FormErrors {
  const errors: FormErrors = {};
  const includePartner = options?.includePartner !== false;
  if (!values.tax_type_id) {
    errors.tax_type_id = `${labels.tax_type_id ?? "Transaction type"} is required.`;
  }
  if (!values.currency_id) {
    errors.currency_id = `${labels.currency_id ?? "Currency"} is required.`;
  }
  if (includePartner && !values.partner_id) {
    errors.partner_id = `${labels.partner_id ?? "Customer"} is required.`;
  }
  if (!values.location_id) {
    errors.location_id = `${labels.location_id ?? "Location"} is required.`;
  }
  return errors;
}
