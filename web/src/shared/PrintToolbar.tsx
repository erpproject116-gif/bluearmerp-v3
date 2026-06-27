import { Show } from "solid-js";
import { PrintLayoutCustomizer } from "./PrintLayoutCustomizer";
import type { PrintLayoutColumn } from "./usePrintLayout";

type LayoutProps = {
  columns: PrintLayoutColumn[];
  hiddenColumns: () => Set<string>;
  onToggleColumn: (key: string) => void;
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
            hiddenColumns={layout().hiddenColumns}
            onToggleColumn={layout().onToggleColumn}
            onShowAll={layout().onShowAll}
          />
        )}
      </Show>
      <div class="quotation-print__toolbar-actions">
        <p class="text-xs text-text-secondary mb-2">
          Drag column edges to resize. Use print layout to show or hide columns. All rows print.
        </p>
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
