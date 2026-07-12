import { createEffect, createSignal, For, Show } from "solid-js";
import { modalDismissClass } from "../../../shared/Modal";

export type ReturnSaleLine = {
  id: number;
  line_no: number;
  item_code: string;
  item_name: string;
  qty: number;
  line_total: number;
};

type Props = {
  open: boolean;
  salesNo: string;
  lines: ReturnSaleLine[];
  returning: boolean;
  onClose: () => void;
  onConfirm: (lineIds: number[]) => void;
};

export function ReturnSaleLinesModal(props: Props) {
  const [selected, setSelected] = createSignal<Set<number>>(new Set());

  createEffect(() => {
    if (props.open) {
      setSelected(new Set(props.lines.map((ln) => ln.id)));
    }
  });

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(props.lines.map((ln) => ln.id)) : new Set<number>());
  };

  const confirm = () => {
    const ids = Array.from(selected());
    if (!ids.length) return;
    props.onConfirm(ids);
  };

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
        <div class="w-full max-w-2xl rounded-2xl border border-stroke bg-white p-6 shadow-xl">
          <div class="mb-4 flex items-center justify-between">
            <div>
              <h2 class="text-lg font-semibold text-text-primary">Return lines</h2>
              <p class="text-sm text-text-secondary">
                Remove selected lines from sale <strong class="font-medium">{props.salesNo}</strong>. Stock,
                serials, and lot qty will be reversed; lines are deleted from the invoice.
              </p>
            </div>
            <button type="button" class={modalDismissClass} onClick={() => props.onClose()}>
              Close
            </button>
          </div>

          <Show when={props.lines.length} fallback={<p class="text-sm text-text-secondary">No lines to return.</p>}>
            <table class="w-full text-sm">
              <thead class="bg-slate-50 text-left text-xs uppercase text-text-secondary">
                <tr>
                  <th class="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={selected().size === props.lines.length && props.lines.length > 0}
                      onChange={(e) => toggleAll(e.currentTarget.checked)}
                    />
                  </th>
                  <th class="px-2 py-2">Line</th>
                  <th class="px-2 py-2">Item</th>
                  <th class="px-2 py-2 text-right">Qty</th>
                  <th class="px-2 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                <For each={props.lines}>
                  {(ln) => (
                    <tr class="border-t border-stroke">
                      <td class="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={selected().has(ln.id)}
                          onChange={() => toggle(ln.id)}
                        />
                      </td>
                      <td class="px-2 py-2">{ln.line_no}</td>
                      <td class="px-2 py-2">
                        {ln.item_code} — {ln.item_name}
                      </td>
                      <td class="px-2 py-2 text-right">{ln.qty}</td>
                      <td class="px-2 py-2 text-right">{ln.line_total.toFixed(2)}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </Show>

          <div class="mt-6 flex justify-end gap-2">
            <button
              type="button"
              class="rounded-lg border border-stroke px-4 py-2 text-sm hover:bg-slate-50"
              disabled={props.returning}
              onClick={() => props.onClose()}
            >
              Cancel
            </button>
            <button
              type="button"
              class="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              disabled={props.returning || selected().size === 0}
              onClick={() => confirm()}
            >
              {props.returning ? "Returning…" : `Return ${selected().size} line(s)`}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
