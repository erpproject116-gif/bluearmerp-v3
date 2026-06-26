import type { SalesDiscountStatusRow } from "../../../shared/useSalesDiscountStatusReport";
import type { DiscountSubtotalBy } from "./salesDiscountStatusTemplate";

export type DiscountReportLine =
  | { kind: "group"; label: string }
  | { kind: "data"; row: SalesDiscountStatusRow }
  | { kind: "subtotal"; label: string; sales_amount: number; invoicing_amount: number; difference_amount: number };

function groupKey(row: SalesDiscountStatusRow, subtotalBy: DiscountSubtotalBy): string {
  if (subtotalBy === "order_date") return row.order_date;
  if (subtotalBy === "customer_name") return row.customer_name;
  return "";
}

export function buildDiscountReportLines(
  rows: SalesDiscountStatusRow[],
  subtotalBy: DiscountSubtotalBy,
): DiscountReportLine[] {
  if (subtotalBy === "none" || rows.length === 0) {
    return rows.map((row) => ({ kind: "data", row }));
  }

  const lines: DiscountReportLine[] = [];
  let currentKey = "";
  let bucket: SalesDiscountStatusRow[] = [];

  const flush = () => {
    if (!bucket.length) return;
    const label =
      subtotalBy === "order_date"
        ? bucket[0].date_no_display.split(" ")[0] ?? bucket[0].order_date
        : bucket[0].customer_name;
    lines.push({ kind: "group", label });
    for (const row of bucket) lines.push({ kind: "data", row });
    lines.push({
      kind: "subtotal",
      label: `Subtotal — ${label}`,
      sales_amount: bucket.reduce((s, r) => s + r.sales_amount, 0),
      invoicing_amount: bucket.reduce((s, r) => s + r.invoicing_amount, 0),
      difference_amount: bucket.reduce((s, r) => s + r.difference_amount, 0),
    });
    bucket = [];
  };

  for (const row of rows) {
    const key = groupKey(row, subtotalBy);
    if (currentKey && key !== currentKey) flush();
    currentKey = key;
    bucket.push(row);
  }
  flush();
  return lines;
}
