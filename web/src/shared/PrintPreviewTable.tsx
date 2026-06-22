import { For, type JSX } from "solid-js";
import { DataTableScroll, ResizableTd, ResizableTh } from "./ResizableTable";
import { useResizableColumns, type ColumnWidthDef } from "./useResizableColumns";

export type PrintPreviewColumn<T> = ColumnWidthDef & {
  header: string;
  class?: string;
  align?: "left" | "right" | "center";
  render: (row: T, index: number) => JSX.Element;
};

type Props<T> = {
  columns: PrintPreviewColumn<T>[];
  rows: T[];
  emptyMessage?: string;
  class?: string;
};

export function PrintPreviewTable<T>(props: Props<T>) {
  const colDefs = () => props.columns.map(({ key, width, minWidth, maxWidth }) => ({ key, width, minWidth, maxWidth }));
  const { widthFor, tableWidth, onResizeStart } = useResizableColumns(colDefs);

  const alignClass = (align?: string) => {
    if (align === "right") return "text-right";
    if (align === "center") return "text-center";
    return "";
  };

  return (
    <DataTableScroll class={props.class}>
      <table class="erp-grid quotation-print__table" style={{ width: `${tableWidth()}px`, "min-width": "100%" }}>
        <thead>
          <tr>
            <For each={props.columns}>
              {(col) => (
                <ResizableTh
                  columnKey={col.key}
                  width={widthFor(col.key)}
                  onResizeStart={onResizeStart}
                  class={`${col.class ?? ""} ${alignClass(col.align)}`.trim()}
                >
                  {col.header}
                </ResizableTh>
              )}
            </For>
          </tr>
        </thead>
        <tbody>
          {props.rows.length === 0 ? (
            <tr>
              <td colSpan={props.columns.length}>{props.emptyMessage ?? "No rows."}</td>
            </tr>
          ) : (
            <For each={props.rows}>
              {(row, i) => (
                <tr>
                  <For each={props.columns}>
                    {(col) => (
                      <ResizableTd
                        width={widthFor(col.key)}
                        class={`${col.class ?? ""} ${alignClass(col.align)}`.trim()}
                      >
                        {col.render(row, i())}
                      </ResizableTd>
                    )}
                  </For>
                </tr>
              )}
            </For>
          )}
        </tbody>
      </table>
    </DataTableScroll>
  );
}
