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

/**
 * Which tax amount columns to show in a line-item grid.
 *
 * Once a transaction type is selected the per-line tax breakdown (Unit (Non-VAT),
 * Non-VAT Total, Tax, Unit (VAT inc.)) is redundant noise for end-users - the tax
 * treatment is already fixed at the header and the totals are shown in the summary.
 * So these columns are hidden for every tax mode. Only Qty, Unit Price and Line Total
 * remain on the line. Amounts are still computed and stored server-side.
 */
export function taxLineGridVisibility(_taxMode: string | undefined): TaxLineGridVisibility {
  return { showBasis: false, showNonVat: false, showTax: false, showVatInc: false };
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
