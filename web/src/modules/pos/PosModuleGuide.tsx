import { A } from "@solidjs/router";
import { For, Show, createSignal } from "solid-js";

export type PosGuideVariant = "terminal" | "manage";

type PosGuideContent = {
  title: string;
  summary: string;
  steps: string[];
  kbHref: string;
  kbLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
};

const CONTENT: Record<PosGuideVariant, PosGuideContent> = {
  terminal: {
    title: "How POS checkout works",
    summary:
      "Open a shift at your stock location, add items (scan barcodes or tap the grid), take payment, then close the shift with counted cash. Checkout creates a sales invoice and reduces inventory.",
    steps: [
      "Choose the register location and enter opening cash, then open the shift.",
      "Scan or search items into the cart. Serial-tracked items need a serial before checkout.",
      "Apply discounts, hold a bill, or attach a customer if needed — then checkout with cash, card, or split tenders.",
      "At end of day, close the shift and enter counted cash to see the shift report.",
    ],
    kbHref: "/app/documentation/kb/pos-checkout-guide",
    kbLabel: "Full POS checkout guide",
    secondaryHref: "/app/documentation/kb/pos-manage-settings",
    secondaryLabel: "Configure catalog & settings",
  },
  manage: {
    title: "What POS Manage is for",
    summary:
      "Administrators set up the catalog, categories, modifiers, tax, default location, tenders, and branding here. Cashiers use Terminal for selling — they do not need this page.",
    steps: [
      "Products — pick which inventory items appear on the POS grid and set prices.",
      "Categories — organize the quick-pick grid cashiers tap during checkout.",
      "Modifiers — optional add-ons (size, toppings) attached to products.",
      "Settings — default location, tax type, tenders, order types, GL auto-post, and UI labels/theme.",
      "Logs — recent POS actions for troubleshooting.",
    ],
    kbHref: "/app/documentation/kb/pos-manage-settings",
    kbLabel: "Full POS Manage guide",
    secondaryHref: "/app/documentation/kb/pos-checkout-guide",
    secondaryLabel: "How cashiers check out",
  },
};

/**
 * Brief on-page POS guide with links into Help & guides / knowledge base.
 * Used on Terminal (outside AppShell) and Manage (inside AppShell).
 */
export function PosModuleGuide(props: {
  variant: PosGuideVariant;
  /** Compact strip for terminal chrome; default is a fuller card. */
  compact?: boolean;
  class?: string;
}) {
  const [open, setOpen] = createSignal(!props.compact);
  const c = () => CONTENT[props.variant];

  return (
    <section
      class={`rounded-xl border border-brand-100 bg-brand-50/50 shadow-sm ${props.class ?? ""}`}
      aria-label={c().title}
    >
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
        <div class="flex min-w-0 items-center gap-2">
          <span class="rounded-md bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            Guide
          </span>
          <p class="truncate text-sm font-medium text-text-primary">{c().title}</p>
        </div>
        <div class="ml-auto flex flex-wrap items-center gap-2">
          <A href={c().kbHref} class="text-xs font-medium text-brand-600 hover:underline">
            Knowledge base
          </A>
          <Show when={c().secondaryHref}>
            <A href={c().secondaryHref!} class="hidden text-xs font-medium text-brand-600 hover:underline sm:inline">
              {c().secondaryLabel}
            </A>
          </Show>
          <button
            type="button"
            class="rounded-md border border-brand-200 bg-white px-2.5 py-1 text-xs font-medium text-brand-700 transition hover:bg-brand-50"
            aria-expanded={open()}
            onClick={() => setOpen(!open())}
          >
            {open() ? "Hide" : "Show me how"}
          </button>
        </div>
      </div>
      <Show when={open()}>
        <div class="border-t border-brand-100 px-4 py-3">
          <p class="max-w-3xl text-sm leading-relaxed text-text-secondary">{c().summary}</p>
          <ol class="mt-3 grid gap-2 sm:grid-cols-2">
            <For each={c().steps}>
              {(step, i) => (
                <li class="rounded-lg border border-stroke bg-white px-3 py-2.5 text-xs leading-relaxed text-text-secondary">
                  <span class="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[11px] font-semibold text-white">
                    {i() + 1}
                  </span>
                  {step}
                </li>
              )}
            </For>
          </ol>
          <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
            <A href={c().kbHref} class="font-medium text-brand-600 hover:underline">
              {c().kbLabel}
            </A>
            <A href="/app/documentation" class="font-medium text-brand-600 hover:underline">
              Help &amp; guides home
            </A>
            <span>
              Stuck? Use the round <span class="font-semibold">?</span> help button and ask in your own words.
            </span>
          </div>
        </div>
      </Show>
    </section>
  );
}
