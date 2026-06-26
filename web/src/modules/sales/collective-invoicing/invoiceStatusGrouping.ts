import type { CollectiveInvoiceStatusRow } from "../../../shared/useCollectiveInvoiceStatusReport";
import type { InvoiceSubtotalBy } from "./collectiveInvoiceStatusTemplate";

export type InvoiceReportLine =
  | { kind: "group"; label: string }
  | { kind: "data"; row: CollectiveInvoiceStatusRow }
  | { kind: "subtotal"; label: string; pretax_amount: number; sales_tax: number; total_sales: number };

function monthLabel(iso: string): string {
  const [y, m] = iso.split("-");
  if (!y || !m) return iso;
  return `${m}/${y} Sub Total`;
}

function groupKey(row: CollectiveInvoiceStatusRow, subtotalBy: InvoiceSubtotalBy): string {
  if (subtotalBy === "invoice_date") return row.invoice_date.slice(0, 7);
  if (subtotalBy === "customer_name") return row.customer_name;
  return "";
}

export function buildInvoiceReportLines(
  rows: CollectiveInvoiceStatusRow[],
  subtotalBy: InvoiceSubtotalBy,
): InvoiceReportLine[] {
  if (subtotalBy === "none" || rows.length === 0) {
    return rows.map((row) => ({ kind: "data", row }));
  }

  const lines: InvoiceReportLine[] = [];
  let currentKey = "";
  let bucket: CollectiveInvoiceStatusRow[] = [];

  const flush = () => {
    if (!bucket.length) return;
    const label =
      subtotalBy === "invoice_date"
        ? monthLabel(bucket[0].invoice_date)
        : bucket[0].customer_name;
    lines.push({ kind: "group", label });
    for (const row of bucket) lines.push({ kind: "data", row });
    lines.push({
      kind: "subtotal",
      label,
      pretax_amount: bucket.reduce((s, r) => s + r.pretax_amount, 0),
      sales_tax: bucket.reduce((s, r) => s + r.sales_tax, 0),
      total_sales: bucket.reduce((s, r) => s + r.total_sales, 0),
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
