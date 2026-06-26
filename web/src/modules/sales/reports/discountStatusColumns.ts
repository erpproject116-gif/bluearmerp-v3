import type { ReportColumnDef } from "../../../shared/reportTemplates/types";

export type DiscountColumnKey =
  | "order_date"
  | "customer_name"
  | "sales_amount"
  | "invoicing_amount"
  | "difference_amount"
  | "apvl_line"
  | "remark";

export const DISCOUNT_STATUS_COLUMNS: ReportColumnDef[] = [
  { key: "order_date", label: "Date" },
  { key: "customer_name", label: "Customer Name" },
  { key: "sales_amount", label: "Sales Amount", align: "right" },
  { key: "invoicing_amount", label: "Invoicing Amount", align: "right" },
  { key: "difference_amount", label: "Difference Amount", align: "right" },
  { key: "apvl_line", label: "Apvl. Line" },
  { key: "remark", label: "Remark" },
];

export type DiscountColumnVisibility = Record<DiscountColumnKey, boolean>;

export function defaultDiscountColumnVisibility(): DiscountColumnVisibility {
  return {
    order_date: true,
    customer_name: true,
    sales_amount: true,
    invoicing_amount: true,
    difference_amount: true,
    apvl_line: true,
    remark: true,
  };
}

export function showDiscountColumn(
  key: DiscountColumnKey,
  visibility: DiscountColumnVisibility,
  displayApvlLine: boolean,
): boolean {
  if (key === "apvl_line") return displayApvlLine && visibility.apvl_line;
  return visibility[key];
}

export function visibleDiscountColumnCount(
  visibility: DiscountColumnVisibility,
  displayApvlLine: boolean,
): number {
  return DISCOUNT_STATUS_COLUMNS.filter((c) =>
    showDiscountColumn(c.key as DiscountColumnKey, visibility, displayApvlLine),
  ).length;
}
