import { A } from "@solidjs/router";

/** Ecount New Sales L2 “Goods Receipt I” shell — honest CTA into Bluearm GR (not Production GR I). */
export function GoodsReceiptIShell() {
  return (
    <div class="rounded-xl border border-stroke bg-white p-6 shadow-sm">
      <h2 class="text-lg font-semibold text-text-primary">Goods Receipt I</h2>
      <p class="mt-2 max-w-xl text-sm text-text-secondary">
        In Ecount, this New Sales workspace tab opens a Goods Receipt I template. Bluearm receives stock
        through Purchase Order → Goods Receipt (not a separate Production GR I slip on Sales yet).
      </p>
      <div class="mt-4 flex flex-wrap gap-3">
        <A
          href="/app/purchase-order/goods-receipt"
          class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Open Goods Receipt
        </A>
        <A
          href="/app/inventory/serial-lot/receive"
          class="rounded-lg border border-stroke px-4 py-2 text-sm font-medium text-text-secondary hover:bg-slate-50"
        >
          Serial / lot receive
        </A>
      </div>
    </div>
  );
}
