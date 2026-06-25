import { Show } from "solid-js";
import { PrintLayoutCustomizer } from "./PrintLayoutCustomizer";
import type { PrintLayoutColumn, PrintLayoutRow } from "./usePrintLayout";

type LayoutProps = {
  columns: PrintLayoutColumn[];
  rows: PrintLayoutRow[];
  hiddenColumns: () => Set<string>;
  hiddenRows: () => Set<string | number>;
  onToggleColumn: (key: string) => void;
  onToggleRow: (key: string | number) => void;
  onShowAll: () => void;
};

type Props = {
  layout?: LayoutProps;
  onPrint: () => void;
  onClose?: () => void;
};

export function PrintToolbar(props: Props) {
  return (
    <div class="quotation-print__toolbar no-print">
      <Show when={props.layout}>
        {(layout) => (
          <PrintLayoutCustomizer
            columns={layout().columns}
            rows={layout().rows}
            hiddenColumns={layout().hiddenColumns}
            hiddenRows={layout().hiddenRows}
            onToggleColumn={layout().onToggleColumn}
            onToggleRow={layout().onToggleRow}
            onShowAll={layout().onShowAll}
          />
        )}
      </Show>
      <div class="quotation-print__toolbar-actions">
        <p class="text-xs text-text-secondary mb-2">Drag column edges to resize. Use print layout to hide columns or rows.</p>
        <div class="flex gap-2">
          <button type="button" class="quotation-print__btn" onClick={props.onPrint}>
            Print
          </button>
          <Show when={props.onClose}>
            <button type="button" class="quotation-print__btn quotation-print__btn--muted" onClick={props.onClose}>
              Close
            </button>
          </Show>
        </div>
      </div>
    </div>
  );
}
