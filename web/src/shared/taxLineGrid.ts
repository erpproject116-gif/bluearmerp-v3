import type { TaxMode } from "./taxcalc";

export type LineGridColumnKey =
  | "line_no"
  | "item_code"
  | "item_name"
  | "description"
  | "qty"
  | "basis"
  | "unit_price"
  | "unit_non_vat"
  | "non_vat_total"
  | "tax"
  | "unit_vat_inc"
  | "line_total"
  | "remark"
  | "actions";

export type LineGridColumnDef = {
  key: LineGridColumnKey | string;
  header: string;
  width: number;
};

export type TaxLineGridVisibility = {
  showBasis: boolean;
  showNonVat: boolean;
  showTax: boolean;
  showVatInc: boolean;
};

/** Which tax amount columns to show based on transaction type tax_mode. */
export function taxLineGridVisibility(taxMode: string | undefined): TaxLineGridVisibility {
  switch (taxMode as TaxMode) {
    case "none":
      return { showBasis: false, showNonVat: false, showTax: false, showVatInc: false };
    case "excluded":
    case "included":
    default:
      return { showBasis: true, showNonVat: true, showTax: true, showVatInc: true };
  }
}

export function filterTaxLineColumns<T extends { key: string }>(
  columns: readonly T[],
  taxMode: string | undefined,
): T[] {
  const vis = taxLineGridVisibility(taxMode);
  return columns.filter((c) => {
    switch (c.key) {
      case "basis":
        return vis.showBasis;
      case "unit_non_vat":
      case "non_vat_total":
        return vis.showNonVat;
      case "tax":
        return vis.showTax;
      case "unit_vat_inc":
        return vis.showVatInc;
      default:
        return true;
    }
  });
}
