/** Client helpers aligned with api/internal/platform/taxcalc. */

export type TaxMode = "included" | "excluded" | "none";

export type TaxTypeMeta = {
  tax_mode: TaxMode | string;
  rate_percent: number;
};

export type InputBasis = "vat_inc_unit" | "non_vat_unit";

/** Default unit-price column when picking items or switching transaction type. */
export function defaultInputBasis(taxMode: string): InputBasis {
  if (taxMode === "included") return "vat_inc_unit";
  return "non_vat_unit";
}

export function formatTaxTypeLabel(name: string, taxMode: string, ratePercent: number): string {
  if (taxMode === "none" || ratePercent <= 0) return name;
  return `${name} (${ratePercent}%)`;
}

export function formatRateSummary(taxMode: string, ratePercent: number): string {
  switch (taxMode) {
    case "included":
      return `VAT included at ${ratePercent}%`;
    case "excluded":
      return `VAT added on top at ${ratePercent}%`;
    case "none":
      return "No tax";
    default:
      return "";
  }
}
