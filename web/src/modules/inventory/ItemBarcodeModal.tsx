import { createEffect, createSignal, For, Show } from "solid-js";
import { Modal } from "../../shared/Modal";
import { printCode128Labels } from "../../shared/printCode128Labels";
import { inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";

export type ItemBarcodeRow = {
  id: number;
  item_code: string;
  item_name: string;
  spec_name?: string;
  barcode: string;
  qty: number;
};

type Props = {
  open: boolean;
  items: Array<{ id: number; item_code: string; item_name: string; spec_name?: string }>;
  onClose: () => void;
};

/** Ecount-style Barcode (Item): selected rows → editable barcode value + qty → print Code128. */
export function ItemBarcodeModal(props: Props) {
  const toast = useToast();
  const [rows, setRows] = createSignal<ItemBarcodeRow[]>([]);

  createEffect(() => {
    if (!props.open) return;
    setRows(
      props.items.map((i) => ({
        id: i.id,
        item_code: i.item_code,
        item_name: i.item_name,
        spec_name: i.spec_name,
        barcode: i.item_code,
        qty: 1,
      })),
    );
  });

  const print = () => {
    const labels: Array<{ code: string; caption?: string }> = [];
    for (const r of rows()) {
      const code = r.barcode.trim();
      if (!code) continue;
      const n = Math.max(1, Math.min(99, Math.floor(r.qty) || 1));
      for (let i = 0; i < n; i++) {
        labels.push({ code, caption: `${r.item_code} — ${code}` });
      }
    }
    if (labels.length === 0) {
      toast.warning("Enter at least one barcode value.");
      return;
    }
    if (!printCode128Labels({ title: "Item barcodes", rows: labels })) {
      toast.warning("Allow pop-ups to print barcodes.");
    }
  };

  return (
    <Modal open={props.open} title="Barcode (Item)" onClose={props.onClose} wide>
      <p class="mb-3 text-sm text-text-secondary">
        Print Code128 labels for selected items. Barcode defaults to item code (editable).
      </p>
      <Show
        when={rows().length > 0}
        fallback={<p class="text-sm text-amber-800">Select one or more items on the list first.</p>}
      >
        <div class="mb-4 overflow-x-auto rounded-lg border border-stroke">
          <table class="min-w-full text-left text-sm">
            <thead class="bg-slate-50 text-xs uppercase text-text-secondary">
              <tr>
                <th class="px-3 py-2">Qty</th>
                <th class="px-3 py-2">Item code</th>
                <th class="px-3 py-2">Item name</th>
                <th class="px-3 py-2">Spec</th>
                <th class="px-3 py-2">Barcode</th>
              </tr>
            </thead>
            <tbody>
              <For each={rows()}>
                {(r, idx) => (
                  <tr class="border-t border-stroke">
                    <td class="px-3 py-2">
                      <input
                        class={`${inputClass} w-16`}
                        type="number"
                        min="1"
                        max="99"
                        value={r.qty}
                        onInput={(e) => {
                          const v = Math.max(1, Math.min(99, Math.floor(Number(e.currentTarget.value)) || 1));
                          setRows((list) => list.map((row, i) => (i === idx() ? { ...row, qty: v } : row)));
                        }}
                      />
                    </td>
                    <td class="px-3 py-2 font-mono">{r.item_code}</td>
                    <td class="px-3 py-2">{r.item_name}</td>
                    <td class="px-3 py-2 text-text-secondary">{r.spec_name || "—"}</td>
                    <td class="px-3 py-2">
                      <input
                        class={`${inputClass} min-w-[10rem] font-mono`}
                        value={r.barcode}
                        onInput={(e) => {
                          const v = e.currentTarget.value;
                          setRows((list) => list.map((row, i) => (i === idx() ? { ...row, barcode: v } : row)));
                        }}
                      />
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
      <div class="flex justify-end gap-2">
        <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={props.onClose}>
          Close
        </button>
        <button
          type="button"
          class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          disabled={rows().length === 0}
          onClick={print}
        >
          Print barcode
        </button>
      </div>
    </Modal>
  );
}
