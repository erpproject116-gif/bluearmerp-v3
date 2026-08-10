import { A } from "@solidjs/router";
import { InlineTip } from "../../shared/inlineGuides";

/** Short map of Stocks screens — keeps Inv Per Branch / Items / Serials from feeling like separate apps. */
export function StocksHowItFits(props?: { class?: string }) {
  return (
    <InlineTip tipId="stocks-how-it-fits" class={`rounded-lg border border-dashed border-stroke bg-slate-50/90 px-3 py-2.5 ${props?.class ?? ""}`}>
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
            Inv Per Branch
          </A>{" "}
          — on-hand qty by branch; serial pill when units are tracked (full list under Serials).
        </li>
        <li>
          <A href="/app/purchases/purchase-receive" class="font-medium text-brand-700 hover:underline">
            Purchase Receive
          </A>{" "}
          — stock in from suppliers (scan new serials / enter lots from the delivery).
        </li>
        <li>
          <A href="/app/inventory/serial-lot/registry" class="font-medium text-brand-700 hover:underline">
            Serials
          </A>{" "}
          /{" "}
          <A href="/app/inventory/serial-lot/lots" class="font-medium text-brand-700 hover:underline">
            Lot batches
          </A>{" "}
          — which units/batches are already in stock (open a serial to manage warranty; use when selling, not when receiving new ones).
        </li>
        <li>
          <A href="/app/inventory/serial-lot/adjustment" class="font-medium text-brand-700 hover:underline">
            Qty fix (serials)
          </A>{" "}
          — exception corrections only; not where Purchase Receive puts new serials (use Serials).
        </li>
      </ul>
    </InlineTip>
  );
}
