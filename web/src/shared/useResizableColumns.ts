import { createEffect, createSignal } from "solid-js";

export const DEFAULT_COL_WIDTH = 140;
export const MIN_COL_WIDTH = 72;
export const MAX_COL_WIDTH = 640;

export type ColumnWidthDef = {
  key: string;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
};

export function useResizableColumns(getDefs: () => ColumnWidthDef[]) {
  const [widths, setWidths] = createSignal<Record<string, number>>({});

  createEffect(() => {
    const defs = getDefs();
    setWidths((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const d of defs) {
        if (next[d.key] == null) {
          next[d.key] = d.width ?? DEFAULT_COL_WIDTH;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  });

  const defFor = (key: string) => getDefs().find((d) => d.key === key);

  const widthFor = (key: string) => widths()[key] ?? defFor(key)?.width ?? DEFAULT_COL_WIDTH;

  const tableWidth = () => getDefs().reduce((sum, d) => sum + widthFor(d.key), 0);

  const onResizeStart = (key: string, event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startW = widthFor(key);
    const min = defFor(key)?.minWidth ?? MIN_COL_WIDTH;
    const max = defFor(key)?.maxWidth ?? MAX_COL_WIDTH;

    const onMove = (e: MouseEvent) => {
      const next = Math.min(max, Math.max(min, startW + e.clientX - startX));
      setWidths((w) => ({ ...w, [key]: next }));
    };

    const onUp = () => {
      document.body.classList.remove("erp-col-resizing");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    document.body.classList.add("erp-col-resizing");
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return { widthFor, onResizeStart, tableWidth };
}

export function columnCellStyle(width: number): Record<string, string> {
  return {
    width: `${width}px`,
    "min-width": `${width}px`,
    "max-width": `${width}px`,
  };
}
