import { type JSX, Show } from "solid-js";
import { columnCellStyle } from "./useResizableColumns";

export function DataTableScroll(props: { children: JSX.Element; class?: string; maxHeight?: string }) {
  return (
    <div
      class={`erp-data-table-scroll ${props.class ?? ""}`.trim()}
      style={props.maxHeight ? { "max-height": props.maxHeight } : undefined}
    >
      {props.children}
    </div>
  );
}

export function ResizableTh(props: {
  columnKey: string;
  width: number;
  onResizeStart: (key: string, e: MouseEvent) => void;
  class?: string;
  resizable?: boolean;
  onClick?: (e: MouseEvent) => void;
  children: JSX.Element;
}) {
  return (
    <th
      class={`erp-grid-th ${props.class ?? ""}`.trim()}
      style={columnCellStyle(props.width)}
      onClick={props.onClick}
    >
      {props.children}
      <Show when={props.resizable !== false}>
        <span
          class="erp-grid-col-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize column"
          onMouseDown={(e) => props.onResizeStart(props.columnKey, e)}
          onClick={(e) => e.stopPropagation()}
        />
      </Show>
    </th>
  );
}

export function ResizableTd(props: {
  width: number;
  class?: string;
  children: JSX.Element;
  onClick?: (e: MouseEvent) => void;
}) {
  return (
    <td class={props.class} style={columnCellStyle(props.width)} onClick={props.onClick}>
      {props.children}
    </td>
  );
}
