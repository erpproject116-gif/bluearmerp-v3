import { For } from "solid-js";
import type { PrintLayoutColumn } from "./usePrintLayout";

type Props = {
  columns: PrintLayoutColumn[];
  hiddenColumns: () => Set<string>;
  onToggleColumn: (key: string) => void;
  onShowAll: () => void;
};

export function PrintLayoutCustomizer(props: Props) {
  return (
    <div class="print-layout-customizer no-print">
      <div class="print-layout-customizer__header">
        <strong class="text-sm text-text-primary">Print layout</strong>
        <button type="button" class="print-layout-customizer__link" onClick={props.onShowAll}>
          Show all columns
        </button>
      </div>
      <p class="print-layout-customizer__hint">
        Uncheck columns to hide them on the printed page. All rows are always included.
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
      </div>
    </div>
  );
}
