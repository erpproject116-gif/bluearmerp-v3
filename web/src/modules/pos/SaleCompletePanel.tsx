import { Show, createSignal } from "solid-js";
import { formatPeso } from "../../shared/money";
import type { PosLastCheckout } from "./posShellV2";

function money(n: number): string {
  return formatPeso(n);
}

/** Full-screen / modal success after checkout (cashier-first shell v2). */
export function SaleCompletePanel(props: {
  result: PosLastCheckout;
  onNext: () => void;
  onPrint?: () => void;
  onVoid?: () => Promise<void> | void;
  voiding?: boolean;
}) {
  const paidAtRegister = () => props.result.grand_total > 0;
  const orPending = () => !props.result.official_receipt_id && paidAtRegister();
  const [confirmVoid, setConfirmVoid] = createSignal(false);

  return (
    <div class="fixed inset-0 z-[60] flex flex-col bg-white" style={{ "padding-bottom": "env(safe-area-inset-bottom)" }}>
      <div class="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center">
        <div class="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <svg class="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <p class="text-sm font-medium uppercase tracking-wide text-slate-500">Sale recorded</p>
          <Show when={paidAtRegister()}>
            <p class="mt-1 text-lg font-semibold text-slate-900">Paid at register</p>
          </Show>
          <Show when={orPending()}>
            <p class="mt-2 text-xs text-amber-800">
              Official receipt posting may still be pending in Finance — this is your counter confirmation.
            </p>
          </Show>
        </div>
        <p class="text-4xl font-bold tabular-nums text-slate-900 sm:text-5xl">{money(props.result.grand_total)}</p>
        <Show when={props.result.change > 0.005}>
          <p class="text-xl font-semibold text-emerald-700">
            Change <span class="tabular-nums">{money(props.result.change)}</span>
          </p>
        </Show>
        <p class="text-sm text-slate-500">
          {props.result.tender_label}
          <Show when={props.result.official_receipt_id}>
            <span class="mt-1 block text-xs">OR linked · ref on file</span>
          </Show>
        </p>
        <p class="font-mono text-xs text-slate-400">{props.result.sales_no}</p>
      </div>
      <div class="flex flex-col gap-2 border-t border-slate-200 p-4">
        <Show when={confirmVoid()}>
          <div class="rounded-xl border border-amber-200 bg-amber-50 p-3 text-left text-sm text-amber-950">
            <p class="font-medium">Void this sale?</p>
            <p class="mt-1 text-xs">Stock and payment records are reversed. This cannot be undone from the register.</p>
            <div class="mt-3 flex gap-2">
              <button
                type="button"
                class="min-h-11 flex-1 rounded-lg border border-slate-300 bg-white py-2 font-medium"
                disabled={props.voiding}
                onClick={() => setConfirmVoid(false)}
              >
                Keep sale
              </button>
              <button
                type="button"
                class="min-h-11 flex-1 rounded-lg bg-red-600 py-2 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                disabled={props.voiding}
                onClick={() => void props.onVoid?.()}
              >
                {props.voiding ? "Voiding…" : "Confirm void"}
              </button>
            </div>
          </div>
        </Show>
        <div class="flex flex-col gap-2 sm:flex-row">
          <Show when={props.onVoid && !confirmVoid()}>
            <button
              type="button"
              class="min-h-12 flex-1 rounded-xl border border-red-200 py-3 text-base font-medium text-red-700 hover:bg-red-50"
              disabled={props.voiding}
              onClick={() => setConfirmVoid(true)}
            >
              Void sale
            </button>
          </Show>
          <Show when={props.onPrint}>
            <button
              type="button"
              class="min-h-12 flex-1 rounded-xl border border-slate-300 py-3 text-base font-medium text-slate-800 hover:bg-slate-50"
              onClick={() => props.onPrint?.()}
            >
              Print slip
            </button>
          </Show>
          <button
            type="button"
            class="min-h-12 flex-[2] rounded-xl bg-emerald-600 py-3 text-base font-semibold text-white hover:bg-emerald-700"
            onClick={props.onNext}
          >
            Next customer
          </button>
        </div>
      </div>
    </div>
  );
}
