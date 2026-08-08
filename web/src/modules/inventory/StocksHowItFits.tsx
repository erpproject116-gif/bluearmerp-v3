import { A } from "@solidjs/router";
import { Show } from "solid-js";
import { useInlineGuides } from "../../shared/inlineGuides";

/** Short map of Stocks screens — keeps Find Stock / Items / Serial-Lot from feeling like separate apps. */
export function StocksHowItFits(props?: { class?: string }) {
  const guides = useInlineGuides();
  return (
    <Show when={guides.enabled()}>
      <div class={`rounded-lg border border-dashed border-stroke bg-slate-50/90 px-3 py-2.5 ${props?.class ?? ""}`}>
        <p class="text-xs font-semibold text-text-primary">How Stocks fits together</p>
        <p class="mt-0.5 text-[11px] text-text-secondary">
          New here? Start on{" "}
          <A href="/app/inventory" class="font-medium text-brand-700 hover:underline">
            Stocks home
          </A>{" "}
          with the Day 1 setup checklist.
        </p>
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
            <A href="/app/purchases/purchase-receive" class="font-medium text-brand-700 hover:underline">
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
          <li>
            <A href="/app/inventory/serial-lot/adjustment" class="font-medium text-brand-700 hover:underline">
              Qty fix (serials)
            </A>{" "}
            — exception corrections only; not where Purchase Receive puts new serials (use Registry).
          </li>
        </ul>
      </div>
    </Show>
  );
}
