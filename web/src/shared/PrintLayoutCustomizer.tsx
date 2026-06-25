import { For, Show } from "solid-js";
import type { PrintLayoutColumn, PrintLayoutRow } from "./usePrintLayout";

type Props = {
  columns: PrintLayoutColumn[];
  rows: PrintLayoutRow[];
  hiddenColumns: () => Set<string>;
  hiddenRows: () => Set<string | number>;
  onToggleColumn: (key: string) => void;
  onToggleRow: (key: string | number) => void;
  onShowAll: () => void;
};

export function PrintLayoutCustomizer(props: Props) {
  return (
    <div class="print-layout-customizer no-print">
      <div class="print-layout-customizer__header">
        <strong class="text-sm text-text-primary">Print layout</strong>
        <button type="button" class="print-layout-customizer__link" onClick={props.onShowAll}>
          Show all
        </button>
      </div>
      <p class="print-layout-customizer__hint">
        Hide columns or rows for this print only. Your data in the grid is not changed.
      </p>
      <div class="print-layout-customizer__sections">
        <section>
          <h4 class="print-layout-customizer__title">Columns</h4>
          <div class="print-layout-customizer__checks">
            <For each={props.columns}>
              {(col) => (
                <label class="print-layout-customizer__check">
                  <input
                    type="checkbox"
                    checked={!props.hiddenColumns().has(col.key)}
                    onChange={() => props.onToggleColumn(col.key)}
                  />
                  {col.label}
                </label>
              )}
            </For>
          </div>
        </section>
        <Show when={props.rows.length > 0}>
          <section>
            <h4 class="print-layout-customizer__title">Rows</h4>
            <div class="print-layout-customizer__checks print-layout-customizer__checks--rows">
              <For each={props.rows}>
                {(row) => (
                  <label class="print-layout-customizer__check">
                    <input
                      type="checkbox"
                      checked={!props.hiddenRows().has(row.key)}
                      onChange={() => props.onToggleRow(row.key)}
                    />
                    {row.label}
                  </label>
                )}
              </For>
            </div>
          </section>
        </Show>
      </div>
    </div>
  );
}
