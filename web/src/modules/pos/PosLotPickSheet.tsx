import { For, Show } from "solid-js";
import type { PosLotPickCandidate, PosLotPickPayload } from "../../shared/usePos";
import { formatPeso } from "../../shared/money";

/**
 * One-step lot picker when FEFO cannot auto-assign.
 * Confirm calls onPick with the chosen lot — parent re-adds the cart line.
 */
export function PosLotPickSheet(props: {
  draft: PosLotPickPayload;
  busy?: boolean;
  onCancel: () => void;
  onPick: (lot: PosLotPickCandidate) => void;
}) {
  const enough = (lot: PosLotPickCandidate) => lot.qty_on_hand + 0.0001 >= props.draft.qty;

  return (
    <div class="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4" onClick={props.onCancel}>
      <div
        class="w-full max-h-[85dvh] overflow-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-md sm:rounded-2xl"
        style={{ "padding-bottom": "max(1.25rem, env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 class="text-lg font-semibold text-slate-900">Pick a lot</h3>
        <p class="mt-1 text-sm text-slate-500">
          {props.draft.item_name} · qty {props.draft.qty}
          {props.draft.unit_price > 0 ? ` · ${formatPeso(props.draft.unit_price)}` : ""}
        </p>

        <Show
          when={props.draft.lots.length > 0}
          fallback={
            <p class="mt-4 text-sm text-slate-500">
              No sellable (non-expired) lots at this register. Transfer stock from another location, then try again.
            </p>
          }
        >
          <ul class="mt-4 space-y-2">
            <For each={props.draft.lots}>
              {(lot) => (
                <li>
                  <button
                    type="button"
                    class="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left hover:border-emerald-400 hover:bg-emerald-50 disabled:opacity-40"
                    disabled={props.busy || !enough(lot)}
                    onClick={() => props.onPick(lot)}
                  >
                    <span class="min-w-0">
                      <span class="block truncate text-sm font-semibold text-slate-900">{lot.lot_no}</span>
                      <span class="text-xs text-slate-500">
                        {lot.expiry_date ? `Exp ${lot.expiry_date}` : "No expiry"}
                        {!enough(lot) ? " · not enough qty" : ""}
                      </span>
                    </span>
                    <span class="shrink-0 text-sm font-medium tabular-nums text-slate-700">{lot.qty_on_hand}</span>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>

        <button
          type="button"
          class="mt-4 w-full rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          disabled={props.busy}
          onClick={props.onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
