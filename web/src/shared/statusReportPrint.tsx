import { createMemo, For, Show, type JSX } from "solid-js";
import { PrintBrandingFooter } from "./branding/PrintBrandingFooter";
import { PrintBrandingHeader } from "./branding/PrintBrandingHeader";
import { PrintToolbar } from "./PrintToolbar";
import { usePrintLayout, type PrintLayoutColumn } from "./usePrintLayout";

export type StatusPrintColumn<T> = {
  key: string;
  label: string;
  align?: "left" | "right";
  render: (row: T) => JSX.Element | string | number;
};

type Props<T> = {
  docTitle: string;
  docSubtitle: string;
  columnMeta: PrintLayoutColumn[];
  columns: StatusPrintColumn<T>[];
  rows: T[];
  generatedAt: Date;
  tableClass?: string;
  pageClass?: string;
  brandingVariant?: "quotation" | "repair";
  summaryFooter?: (visibleColumns: StatusPrintColumn<T>[]) => JSX.Element;
};

function alignClass(align?: string) {
  if (align === "right") return "num";
  return "";
}

export function StatusReportPrintDocument<T>(props: Props<T>) {
  const layout = usePrintLayout(() => props.columnMeta);

  const visibleColumns = createMemo(() => {
    const keys = new Set(layout.visibleColumns().map((c) => c.key));
    return props.columns.filter((c) => keys.has(c.key));
  });

  return (
    <>
      <article class={props.pageClass ?? "quotation-print__page status-report-print"}>
        <PrintBrandingHeader
          variant={props.brandingVariant}
          docTitle={props.docTitle}
          docSubtitle={props.docSubtitle}
        />
        <table class={props.tableClass ?? "quotation-print__table"}>
          <thead>
            <tr>
              <For each={visibleColumns()}>
                {(col) => <th class={alignClass(col.align)}>{col.label}</th>}
              </For>
            </tr>
          </thead>
          <tbody>
            <For each={props.rows}>
              {(row) => (
                <tr>
                  <For each={visibleColumns()}>
                    {(col) => <td class={alignClass(col.align)}>{col.render(row)}</td>}
                  </For>
                </tr>
              )}
            </For>
          </tbody>
          <Show when={props.summaryFooter}>
            <tfoot>{props.summaryFooter!(visibleColumns())}</tfoot>
          </Show>
        </table>
        <PrintBrandingFooter
          class="quotation-print__footer"
          defaultFooter={`Generated from BluearmERP · ${props.generatedAt.toLocaleString()}`}
        />
      </article>

      <PrintToolbar
        layout={{
          columns: props.columnMeta,
          hiddenColumns: layout.hiddenColumns,
          onToggleColumn: layout.toggleColumn,
          onShowAll: layout.showAll,
        }}
        onPrint={() => window.print()}
        onClose={() => window.close()}
      />
    </>
  );
}
