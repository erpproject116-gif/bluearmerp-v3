import { createEffect, createSignal, For, Show } from "solid-js";
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

  const isMulti = () => props.lots.length > 1;
  const singleLotNo = () => (props.lots.length === 1 ? props.lots[0]?.lot_no ?? "" : "");
  const placeholder = () =>
    props.policy?.trim().toLowerCase() === "optional" ? "Optional lot no." : "Lot number";

  // Keep single-lot qty aligned with the receive line qty.
  createEffect(() => {
    if (props.lots.length !== 1) return;
    const lot = props.lots[0];
    if (!lot) return;
    const nextQty = props.expectedQty > 0 ? props.expectedQty : 0;
    if (Number(lot.qty) === nextQty) return;
    props.onChange([{ ...lot, qty: nextQty }]);
  });

  const openEditor = () => {
    setDraft(
      props.lots.length > 0
        ? props.lots.map((lot) => ({ ...lot }))
        : [{ lot_no: singleLotNo(), qty: props.expectedQty > 0 ? props.expectedQty : 0 }],
    );
    setOpen(true);
  };

  const summary = () => {
    const totalQty = props.lots.reduce((sum, lot) => sum + Number(lot.qty || 0), 0);
    const displayQty = Math.round(totalQty * 10000) / 10000;
    return `${props.lots.length} lots · ${displayQty}`;
  };

  const setSingleLot = (lotNo: string) => {
    const trimmed = lotNo.trim();
    if (!trimmed) {
      props.onChange([]);
      return;
    }
    props.onChange([{ lot_no: lotNo, qty: props.expectedQty > 0 ? props.expectedQty : 0 }]);
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
      <Show
        when={isMulti()}
        fallback={
          <div class="flex min-w-0 items-center gap-1">
            <input
              class={`${inputClass} min-w-0 flex-1`}
              value={singleLotNo()}
              placeholder={placeholder()}
              disabled={props.disabled}
              onInput={(e) => setSingleLot(e.currentTarget.value)}
            />
            <button
              type="button"
              class="shrink-0 text-[11px] text-brand-700 hover:underline disabled:opacity-50"
              disabled={props.disabled}
              title="Split across multiple lots"
              onClick={openEditor}
            >
              + Lots
            </button>
          </div>
        }
      >
        <div class="flex min-w-0 items-center gap-1">
          <button
            type="button"
            class="min-w-0 flex-1 truncate text-left text-xs text-brand-700 hover:underline disabled:opacity-50"
            disabled={props.disabled}
            onClick={openEditor}
          >
            {summary()}
          </button>
        </div>
      </Show>

      <Modal open={open()} title="Receive lots" onClose={() => setOpen(false)} wide>
        <p class="mb-3 text-sm text-text-secondary">
          Enter supplier lot numbers and received quantities. Total lot quantity must equal {props.expectedQty.toFixed(4)}
          {props.policy?.trim().toLowerCase() === "optional"
            ? " when lots are entered; leave all rows empty to receive quantity only."
            : "."}
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
