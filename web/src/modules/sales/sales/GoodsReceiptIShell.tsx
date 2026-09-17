import { A } from "@solidjs/router";

/** New Sales workspace shell — CTAs into BluearmERP Purchase Receive (not Production GR). */
export function GoodsReceiptIShell() {
  return (
    <div class="rounded-xl border border-stroke bg-white p-6 shadow-sm">
      <h2 class="text-lg font-semibold text-text-primary">Receive stock</h2>
      <p class="mt-2 max-w-xl text-sm text-text-secondary">
        BluearmERP receives stock through Purchase Receive (inventory and serials post when line tracking data is
        complete). Legacy receive history stays available for audit.
      </p>
      <div class="mt-4 flex flex-wrap gap-3">
        <A
          href="/app/purchases/purchase-receive/new"
          class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Purchase Receive
        </A>
        <A
          href="/app/purchase-order/goods-receipt"
          class="rounded-lg border border-stroke px-4 py-2 text-sm font-medium text-text-secondary hover:bg-slate-50"
        >
          Receive history
        </A>
        <A
          href="/app/inventory/serial-lot/receive"
          class="rounded-lg border border-stroke px-4 py-2 text-sm font-medium text-text-secondary hover:bg-slate-50"
        >
          Legacy receive / scan
        </A>
      </div>
    </div>
  );
}
