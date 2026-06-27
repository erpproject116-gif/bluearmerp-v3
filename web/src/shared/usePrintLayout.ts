import { createEffect, createMemo, createSignal } from "solid-js";

export type PrintLayoutColumn = { key: string; label: string };

/** Column-only print layout — rows are never hidden from printable output. */
export function usePrintLayout(columns: () => PrintLayoutColumn[]) {
  const [hiddenColumns, setHiddenColumns] = createSignal<Set<string>>(new Set());

  const columnSignature = createMemo(() => columns().map((c) => c.key).join("|"));

  createEffect(() => {
    columnSignature();
    setHiddenColumns(new Set<string>());
  });

  const visibleColumns = createMemo(() => columns().filter((c) => !hiddenColumns().has(c.key)));

  const toggleColumn = (key: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const showAll = () => setHiddenColumns(new Set<string>());

  return {
    hiddenColumns,
    visibleColumns,
    toggleColumn,
    showAll,
  };
}
