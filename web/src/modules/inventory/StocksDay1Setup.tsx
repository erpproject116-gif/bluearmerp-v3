import { A } from "@solidjs/router";
import { createSignal, For, Show } from "solid-js";
import type { InventoryWorkspaceSummary } from "../../shared/reports/useModuleReports";

const DISMISS_KEY = "stocks-day1-setup-dismissed";

type Step = {
  id: string;
  title: string;
  why: string;
  href: string;
  cta: string;
  done: (s: InventoryWorkspaceSummary | undefined) => boolean;
  optional?: boolean;
};

const STEPS: Step[] = [
  {
    id: "places",
    title: "1. Add your places",
    why: "Stores or warehouses where goods sit. Every receive and sale needs a place.",
    href: "/app/inventory/locations",
    cta: "Open locations",
    done: (s) => (s?.active_locations ?? 0) > 0,
  },
  {
    id: "people",
    title: "2. Add customers and suppliers",
    why: "Who you buy from and sell to. You can add them as you go, but having a few ready helps.",
    href: "/app/inventory/partners",
    cta: "Open partners",
    done: () => false,
    optional: true,
  },
  {
    id: "products",
    title: "3. Add your products",
    why: "Turn on quantity tracking for anything you count on the shelf. Use serial only if each unit has its own number; use lot only for batch codes.",
    href: "/app/inventory/items",
    cta: "Open items",
    done: (s) => (s?.active_items ?? 0) > 0,
  },
  {
    id: "opening",
    title: "4. Record what is already on the shelf",
    why: "If you already have goods in the store, enter opening counts here. Creating a product or purchase order alone does not fill Find Stock.",
    href: "/app/inventory/stock-entries",
    cta: "Open stock entries",
    done: (s) => (s?.items_with_stock ?? 0) > 0,
    optional: true,
  },
  {
    id: "check",
    title: "5. Check Find Stock",
    why: "This is your shelf view — how much you have by place. It fills after step 4, or after you receive a delivery.",
    href: "/app/inventory/find-stock",
    cta: "Open Find Stock",
    done: (s) => (s?.items_with_stock ?? 0) > 0,
  },
];

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(value: boolean) {
  try {
    localStorage.setItem(DISMISS_KEY, value ? "1" : "0");
  } catch {
    /* private mode */
  }
}

type Props = {
  summary: InventoryWorkspaceSummary | undefined;
  loading?: boolean;
};

/** Plain-language first-run checklist for Stocks home. */
export function StocksDay1Setup(props: Props) {
  const [dismissed, setDismissed] = createSignal(readDismissed());
  const [showAnyway, setShowAnyway] = createSignal(false);

  const readyToTrade = () => {
    const s = props.summary;
    return (s?.active_locations ?? 0) > 0 && (s?.active_items ?? 0) > 0;
  };

  const hidden = () => dismissed() && !showAnyway();

  return (
    <Show
      when={!hidden()}
      fallback={
        <button
          type="button"
          class="text-xs font-medium text-brand-600 hover:underline"
          onClick={() => setShowAnyway(true)}
        >
          Show Day 1 setup checklist
        </button>
      }
    >
      <section class="rounded-xl border border-brand-100 bg-brand-50/50 p-5 shadow-sm">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="text-base font-semibold text-text-primary">Day 1 setup — before you buy or sell</h2>
            <p class="mt-1 text-sm text-text-secondary">
              Places and products first. Put starting stock on the shelf if you already have goods. Then you can receive
              deliveries, sell, and use Find Stock.
            </p>
            <p class="mt-1 text-xs text-text-secondary">
              Order: places → people → products → opening stock (if needed) → Find Stock → then buy / sell.
            </p>
          </div>
          <button
            type="button"
            class="shrink-0 rounded-lg border border-stroke bg-white px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-slate-50"
            onClick={() => {
              writeDismissed(true);
              setDismissed(true);
              setShowAnyway(false);
            }}
          >
            Hide for now
          </button>
        </div>

        <ol class="mt-4 space-y-3">
          <For each={STEPS}>
            {(step) => {
              const isDone = () => step.done(props.summary);
              return (
                <li class="flex flex-wrap items-start gap-3 rounded-lg border border-stroke/80 bg-white px-3 py-3">
                  <span
                    class={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      isDone() ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-text-secondary"
                    }`}
                    aria-hidden="true"
                  >
                    {isDone() ? "✓" : step.id === "people" || step.id === "opening" ? "·" : "○"}
                  </span>
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <p class="text-sm font-medium text-text-primary">{step.title}</p>
                      <Show when={step.optional}>
                        <span class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                          If needed
                        </span>
                      </Show>
                      <Show when={isDone()}>
                        <span class="text-[11px] font-medium text-emerald-700">Done</span>
                      </Show>
                    </div>
                    <p class="mt-0.5 text-xs leading-snug text-text-secondary">{step.why}</p>
                  </div>
                  <A
                    href={step.href}
                    class="shrink-0 rounded-lg border border-stroke px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
                  >
                    {step.cta}
                  </A>
                </li>
              );
            }}
          </For>
        </ol>

        <div class="mt-4 rounded-lg border border-dashed border-stroke bg-white/80 px-3 py-3">
          <p class="text-sm font-medium text-text-primary">After setup — live work</p>
          <p class="mt-1 text-xs text-text-secondary">
            <Show
              when={readyToTrade()}
              fallback="Finish places and products first. Opening stock is only required if you already have goods in the store."
            >
              You’re ready to trade. Buying: order → receive when the delivery arrives → bill → pay. Selling: sale → get
              paid. Find Stock updates when goods come in or go out.
            </Show>
          </p>
          <div class="mt-2 flex flex-wrap gap-2">
            <A
              href="/app/purchase-order/purchase-orders"
              class="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
            >
              Purchase orders
            </A>
            <A
              href="/app/purchase-order/goods-receipt"
              class="rounded-lg border border-stroke px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-slate-50"
            >
              Purchase Receive
            </A>
            <A
              href="/app/sales"
              class="rounded-lg border border-stroke px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-slate-50"
            >
              Sales
            </A>
          </div>
        </div>
      </section>
    </Show>
  );
}
