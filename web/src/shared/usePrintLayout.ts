import { createEffect, createMemo, createSignal } from "solid-js";

export type PrintLayoutColumn = { key: string; label: string };
export type PrintLayoutRow = { key: string | number; label: string };

export function usePrintLayout(
  columns: () => PrintLayoutColumn[],
  rows: () => PrintLayoutRow[],
) {
  const [hiddenColumns, setHiddenColumns] = createSignal<Set<string>>(new Set());
  const [hiddenRows, setHiddenRows] = createSignal<Set<string | number>>(new Set());

  const columnSignature = createMemo(() => columns().map((c) => c.key).join("|"));
  const rowSignature = createMemo(() => rows().map((r) => String(r.key)).join("|"));

  createEffect(() => {
    columnSignature();
    rowSignature();
    setHiddenColumns(new Set<string>());
    setHiddenRows(new Set<string | number>());
  });

  const visibleColumns = createMemo(() => columns().filter((c) => !hiddenColumns().has(c.key)));
  const visibleRowKeys = createMemo(() => {
    const hidden = hiddenRows();
    return new Set(rows().filter((r) => !hidden.has(r.key)).map((r) => r.key));
  });

  const toggleColumn = (key: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleRow = (key: string | number) => {
    setHiddenRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const showAll = () => {
    setHiddenColumns(new Set<string>());
    setHiddenRows(new Set<string | number>());
  };

  return {
    hiddenColumns,
    hiddenRows,
    visibleColumns,
    visibleRowKeys,
    toggleColumn,
    toggleRow,
    showAll,
  };
}

export function filterPrintRows<T>(rows: T[], visibleKeys: Set<string | number>, rowKey: (row: T, index: number) => string | number) {
  return rows.filter((row, index) => visibleKeys.has(rowKey(row, index)));
}
