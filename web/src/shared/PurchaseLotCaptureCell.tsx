import { createSignal, For } from "solid-js";
import { Modal } from "./Modal";
import { inputClass } from "./SpreadsheetGrid";

export type PurchaseLotLine = {
  lot_no: string;
  qty: number;
};

type Props = {
  lots: PurchaseLotLine[];
  expectedQty: number;
  policy?: string;
  disabled?: boolean;
  onChange: (lots: PurchaseLotLine[]) => void;
};

export function PurchaseLotCaptureCell(props: Props) {
  const [open, setOpen] = createSignal(false);
  const [draft, setDraft] = createSignal<PurchaseLotLine[]>([]);

  const openEditor = () => {
    setDraft(
      props.lots.length > 0
        ? props.lots.map((lot) => ({ ...lot }))
        : [{ lot_no: "", qty: props.expectedQty > 0 ? props.expectedQty : 0 }],
    );
    setOpen(true);
  };

  const summary = () => {
    if (props.lots.length === 0) {
      return props.policy?.trim().toLowerCase() === "optional" ? "Optional · add lots" : "Add lots";
    }
    const totalQty = props.lots.reduce((sum, lot) => sum + Number(lot.qty || 0), 0);
    const displayQty = Math.round(totalQty * 10000) / 10000;
    return `${props.lots.length} lot${props.lots.length === 1 ? "" : "s"} · ${displayQty}`;
  };

  const save = () => {
    props.onChange(
      draft()
        .map((lot) => ({ lot_no: lot.lot_no.trim(), qty: Number(lot.qty) || 0 }))
        .filter((lot) => lot.lot_no !== ""),
    );
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        class="w-full truncate text-left text-xs text-brand-700 hover:underline disabled:opacity-50"
        disabled={props.disabled}
        onClick={openEditor}
      >
        {summary()}
      </button>

      <Modal open={open()} title="Receive lots" onClose={() => setOpen(false)} wide>
        <p class="mb-3 text-sm text-text-secondary">
          Enter supplier lot numbers and received quantities. Total lot quantity must equal {props.expectedQty.toFixed(4)}
          {props.policy?.trim().toLowerCase() === "optional" ? " when lots are entered; leave all rows empty to receive quantity only." : "."}
        </p>
        <div class="space-y-2">
          <For each={draft()}>
            {(lot, index) => (
              <div class="grid grid-cols-[minmax(0,1fr)_9rem_auto] items-end gap-2">
                <label class="text-sm">
                  <span class="text-text-secondary">Lot number</span>
                  <input
                    class={`${inputClass} mt-1 w-full`}
                    value={lot.lot_no}
                    onInput={(e) =>
                      setDraft((rows) =>
                        rows.map((row, i) => (i === index() ? { ...row, lot_no: e.currentTarget.value } : row)),
                      )
                    }
                  />
                </label>
                <label class="text-sm">
                  <span class="text-text-secondary">Quantity</span>
                  <input
                    class={`${inputClass} mt-1 w-full text-right`}
                    type="number"
                    min="0"
                    step="any"
                    value={String(lot.qty)}
                    onInput={(e) =>
                      setDraft((rows) =>
                        rows.map((row, i) =>
                          i === index() ? { ...row, qty: Number(e.currentTarget.value) || 0 } : row,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  class="mb-0.5 rounded border border-stroke px-2 py-1.5 text-sm text-red-600"
                  onClick={() => setDraft((rows) => rows.filter((_, i) => i !== index()))}
                >
                  Remove
                </button>
              </div>
            )}
          </For>
        </div>
        <button
          type="button"
          class="mt-3 rounded border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50"
          onClick={() => setDraft((rows) => [...rows, { lot_no: "", qty: 0 }])}
        >
          + Add lot
        </button>
        <div class="mt-4 flex justify-end gap-2">
          <button type="button" class="rounded border border-stroke px-3 py-1.5 text-sm" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button type="button" class="rounded bg-brand-600 px-3 py-1.5 text-sm text-white" onClick={save}>
            Done
          </button>
        </div>
      </Modal>
    </>
  );
}
