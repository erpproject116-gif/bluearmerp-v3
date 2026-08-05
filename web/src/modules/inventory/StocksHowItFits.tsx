import { A } from "@solidjs/router";

/** Short map of Stocks screens — keeps Find Stock / Items / Serial-Lot from feeling like separate apps. */
export function StocksHowItFits(props?: { class?: string }) {
  return (
    <div class={`rounded-lg border border-dashed border-stroke bg-slate-50/90 px-3 py-2.5 ${props?.class ?? ""}`}>
      <p class="text-xs font-semibold text-text-primary">How Stocks fits together</p>
      <ul class="mt-1 list-disc space-y-0.5 pl-4 text-[11px] leading-snug text-text-secondary">
        <li>
          <A href="/app/inventory/items" class="font-medium text-brand-700 hover:underline">
            Items
          </A>{" "}
          — setup (qty / serial / lot tracking). Not live stock.
        </li>
        <li>
          <A href="/app/inventory/find-stock" class="font-medium text-brand-700 hover:underline">
            Find Stock
          </A>{" "}
          — on-hand qty by branch, plus serial/lot counts when tracked.
        </li>
        <li>
          <A href="/app/purchase-order/goods-receipt" class="font-medium text-brand-700 hover:underline">
            Purchase Receive
          </A>{" "}
          — stock in from suppliers (scan new serials / enter lots from the delivery).
        </li>
        <li>
          <A href="/app/inventory/serial-lot/registry" class="font-medium text-brand-700 hover:underline">
            Serial registry
          </A>{" "}
          /{" "}
          <A href="/app/inventory/serial-lot/lots" class="font-medium text-brand-700 hover:underline">
            Lot batches
          </A>{" "}
          — which units/batches are already in stock (use when selling, not when receiving new ones).
        </li>
      </ul>
    </div>
  );
}
