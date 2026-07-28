import { A } from "@solidjs/router";
import { For, Show } from "solid-js";

export type LearnLink = {
  label: string;
  href: string;
  /** When false, show as tracked gap (no navigation promise of parity). */
  ready: boolean;
  hint?: string;
};

export type LearnGroup = {
  title: string;
  links: LearnLink[];
};

/** Mirrors Ecount MyPage "Learn to use" groups for Bluearm Computer Store daily ops. */
export const LEARN_GROUPS: LearnGroup[] = [
  {
    title: "Enter / view inventory slips",
    links: [
      { label: "Sales List", href: "/app/sales/sales", ready: true },
      { label: "Purchase List", href: "/app/purchases/purchases", ready: true },
      { label: "Goods Receipt List", href: "/app/purchase-order/goods-receipt", ready: true },
    ],
  },
  {
    title: "Enter accounting vouchers",
    links: [
      { label: "Sales Invoice", href: "/app/sales/sales/new", ready: true },
      { label: "Purchase Invoice", href: "/app/purchases/purchases/new", ready: true },
      { label: "Cash In — From Customer", href: "/app/finance/official-receipts", ready: true },
      { label: "Cash Out — To Vendor", href: "/app/finance/payment-vouchers", ready: true },
    ],
  },
  {
    title: "View accounting & collections",
    links: [
      { label: "Collections (AR)", href: "/app/finance/collections", ready: true },
      { label: "Disbursements (AP)", href: "/app/finance/disbursements", ready: true },
      { label: "Journal entries", href: "/app/finance/acct-i/journal-entries", ready: true },
    ],
  },
];

export function MyPageLearnPanel() {
  return (
    <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
      <div class="mb-3 flex items-center justify-between gap-2">
        <h2 class="text-sm font-semibold text-text-primary">Learn to use BluearmERP</h2>
        <A href="/app/documentation" class="text-xs font-medium text-brand-600 hover:underline">
          Help &amp; guides
        </A>
      </div>
      <p class="mb-4 text-xs text-text-secondary">
        Start here — same idea as Ecount MyPage. Prefer these links over guessing menus (fewer wrong-screen tickets).
      </p>
      <div class="space-y-4">
        <For each={LEARN_GROUPS}>
          {(group) => (
            <div>
              <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">{group.title}</p>
              <ul class="space-y-1.5">
                <For each={group.links}>
                  {(link) => (
                    <li>
                      <Show
                        when={link.ready}
                        fallback={
                          <span class="block rounded-lg border border-dashed border-stroke px-3 py-2 text-sm text-text-secondary">
                            {link.label}
                            <span class="ml-2 text-xs text-amber-700">(tracked gap)</span>
                          </span>
                        }
                      >
                        <A
                          href={link.href}
                          class="flex items-center justify-between rounded-lg border border-stroke px-3 py-2 text-sm text-text-primary transition hover:border-brand-200 hover:bg-brand-50"
                        >
                          <span>{link.label}</span>
                          <span class="text-xs text-brand-600">Open</span>
                        </A>
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
            </div>
          )}
        </For>
      </div>
    </section>
  );
}
