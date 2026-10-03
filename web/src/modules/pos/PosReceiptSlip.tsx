import { For, Show } from "solid-js";
import { formatPeso } from "../../shared/money";
import { posTenderLabel, type PosReceiptFormat } from "../../shared/usePos";

function money(n: number): string {
  return formatPeso(n);
}

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * Counter slip from receipt_format snapshot.
 * Screen preview + browser print — not an HTML receipt builder.
 */
export function PosReceiptSlip(props: {
  receipt: PosReceiptFormat;
  onClose: () => void;
  reprint?: boolean;
}) {
  const print = () => {
    window.print();
  };

  return (
    <div class="fixed inset-0 z-[70] flex flex-col bg-slate-900/50">
      <div class="no-print flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
        <p class="text-sm font-medium text-slate-800">
          {props.reprint ? "Reprint slip" : "Receipt slip"}
        </p>
        <div class="flex gap-2">
          <button
            type="button"
            class="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
            onClick={props.onClose}
          >
            Close
          </button>
          <button
            type="button"
            class="min-h-11 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            onClick={print}
          >
            Print
          </button>
        </div>
      </div>
      <div class="flex flex-1 justify-center overflow-auto p-4">
        <article
          class="pos-receipt-slip w-full max-w-[22rem] bg-white px-4 py-5 text-slate-900 shadow-lg"
          style={{ "font-family": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
        >
          <header class="mb-3 text-center">
            <h1 class="text-base font-bold uppercase tracking-wide">{props.receipt.doc_title}</h1>
            <p class="mt-1 text-sm font-semibold">{props.receipt.company_name}</p>
            <Show when={props.receipt.location_name}>
              <p class="text-xs text-slate-600">{props.receipt.location_name}</p>
            </Show>
            <Show when={props.reprint}>
              <p class="mt-1 text-[10px] uppercase tracking-wider text-slate-500">Reprint</p>
            </Show>
          </header>

          <div class="mb-3 space-y-0.5 border-b border-dashed border-slate-300 pb-3 text-xs">
            <div class="flex justify-between gap-2">
              <span>Sale</span>
              <span class="font-mono">{props.receipt.sales_no}</span>
            </div>
            <Show when={props.receipt.official_receipt_no}>
              <div class="flex justify-between gap-2 font-semibold">
                <span>OR#</span>
                <span class="font-mono">{props.receipt.official_receipt_no}</span>
              </div>
            </Show>
            <div class="flex justify-between gap-2">
              <span>When</span>
              <span>{formatWhen(props.receipt.at)}</span>
            </div>
            <Show when={props.receipt.cashier_name}>
              <div class="flex justify-between gap-2">
                <span>Cashier</span>
                <span>{props.receipt.cashier_name}</span>
              </div>
            </Show>
            <Show when={props.receipt.table_label}>
              <div class="flex justify-between gap-2">
                <span>Table</span>
                <span>{props.receipt.table_label}</span>
              </div>
            </Show>
          </div>

          <Show
            when={props.receipt.lines.length > 0}
            fallback={<p class="mb-3 text-center text-xs text-slate-500">Line details unavailable — totals only.</p>}
          >
            <ul class="mb-3 space-y-2 border-b border-dashed border-slate-300 pb-3 text-xs">
              <For each={props.receipt.lines}>
                {(ln) => (
                  <li>
                    <div class="flex justify-between gap-2">
                      <span class="min-w-0 flex-1 break-words font-medium">{ln.item_name}</span>
                      <span class="shrink-0 tabular-nums">{money(ln.line_total)}</span>
                    </div>
                    <p class="text-slate-500">
                      {ln.qty} × {money(ln.unit_price)}
                    </p>
                  </li>
                )}
              </For>
            </ul>
          </Show>

          <div class="mb-3 space-y-0.5 border-b border-dashed border-slate-300 pb-3 text-xs">
            <div class="flex justify-between">
              <span>Subtotal</span>
              <span class="tabular-nums">{money(props.receipt.subtotal)}</span>
            </div>
            <Show when={props.receipt.discount > 0.005}>
              <div class="flex justify-between">
                <span>Discount</span>
                <span class="tabular-nums">-{money(props.receipt.discount)}</span>
              </div>
            </Show>
            <Show when={props.receipt.tax > 0.005}>
              <div class="flex justify-between">
                <span>Tax</span>
                <span class="tabular-nums">{money(props.receipt.tax)}</span>
              </div>
            </Show>
            <Show when={props.receipt.tip > 0.005}>
              <div class="flex justify-between">
                <span>Tip</span>
                <span class="tabular-nums">{money(props.receipt.tip)}</span>
              </div>
            </Show>
            <div class="flex justify-between pt-1 text-sm font-bold">
              <span>Total</span>
              <span class="tabular-nums">{money(props.receipt.grand_total)}</span>
            </div>
          </div>

          <div class="mb-3 space-y-0.5 text-xs">
            <For each={props.receipt.tenders}>
              {(t) => (
                <div class="flex justify-between">
                  <span>{posTenderLabel(t.tender_type)}</span>
                  <span class="tabular-nums">{money(t.amount)}</span>
                </div>
              )}
            </For>
            <Show when={props.receipt.change > 0.005}>
              <div class="flex justify-between font-semibold">
                <span>Change</span>
                <span class="tabular-nums">{money(props.receipt.change)}</span>
              </div>
            </Show>
          </div>

          <p class="text-center text-[10px] leading-snug text-slate-500">{props.receipt.footer_note}</p>
        </article>
      </div>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .pos-receipt-slip, .pos-receipt-slip * { visibility: visible !important; }
          .pos-receipt-slip {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 80mm !important;
            max-width: 80mm !important;
            box-shadow: none !important;
            margin: 0 !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  );
}
