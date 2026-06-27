import { createMemo } from "solid-js";
import { PrintPreviewTable, type PrintPreviewColumn } from "./PrintPreviewTable";
import { usePrintLayout, type PrintLayoutColumn } from "./usePrintLayout";

export type DocumentLineRow = {
  line_no: number;
  item_code?: string | null;
  item_name?: string | null;
  description?: string | null;
  qty?: number;
  unit_non_vat?: number;
  non_vat_total?: number;
  tax_amount?: number;
  line_total?: number;
};

export const DOCUMENT_LINE_COLUMN_META: PrintLayoutColumn[] = [
  { key: "line_no", label: "#" },
  { key: "item_code", label: "Item Code" },
  { key: "description", label: "Description" },
  { key: "qty", label: "Qty" },
  { key: "unit_non_vat", label: "Unit (Non-VAT)" },
  { key: "non_vat_total", label: "Non-VAT Total" },
  { key: "tax_amount", label: "Tax" },
  { key: "line_total", label: "Line Total" },
];

export function documentLinePrintColumns(
  formatMoney: (amount: number) => string,
): PrintPreviewColumn<DocumentLineRow>[] {
  return [
    { key: "line_no", header: "#", width: 48, align: "center", render: (ln) => ln.line_no },
    { key: "item_code", header: "Item Code", width: 100, render: (ln) => ln.item_code || "—" },
    {
      key: "description",
      header: "Description",
      width: 240,
      render: (ln) => (
        <>
          {ln.item_name}
          {ln.description ? ` — ${ln.description}` : ""}
        </>
      ),
    },
    { key: "qty", header: "Qty", width: 72, align: "right", render: (ln) => ln.qty ?? 0 },
    {
      key: "unit_non_vat",
      header: "Unit (Non-VAT)",
      width: 110,
      align: "right",
      render: (ln) => formatMoney(ln.unit_non_vat ?? 0),
    },
    {
      key: "non_vat_total",
      header: "Non-VAT Total",
      width: 110,
      align: "right",
      render: (ln) => formatMoney(ln.non_vat_total ?? 0),
    },
    {
      key: "tax_amount",
      header: "Tax",
      width: 90,
      align: "right",
      render: (ln) => formatMoney(ln.tax_amount ?? 0),
    },
    {
      key: "line_total",
      header: "Line Total",
      width: 110,
      align: "right",
      render: (ln) => formatMoney(ln.line_total ?? 0),
    },
  ];
}

export function useDocumentLinePrintLayout() {
  return usePrintLayout(() => DOCUMENT_LINE_COLUMN_META);
}

type TableProps = {
  lines: () => DocumentLineRow[];
  formatMoney: (amount: number) => string;
  layout: ReturnType<typeof useDocumentLinePrintLayout>;
};

export function DocumentLinePrintTable(props: TableProps) {
  const allColumns = createMemo(() => documentLinePrintColumns(props.formatMoney));
  const visibleColumns = createMemo(() => {
    const keys = new Set(props.layout.visibleColumns().map((c) => c.key));
    return allColumns().filter((c) => keys.has(c.key));
  });

  return (
    <PrintPreviewTable
      class="mb-4 quotation-print__table-wrap"
      emptyMessage="No line items."
      columns={visibleColumns()}
      rows={props.lines()}
    />
  );
}
