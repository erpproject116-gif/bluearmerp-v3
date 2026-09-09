import { A, useLocation } from "@solidjs/router";
import { For } from "solid-js";

export type InvBookFamilyKind = "item" | "serial" | "lot";

const links: { kind: InvBookFamilyKind; label: string; href: string; hint: string }[] = [
  {
    kind: "item",
    label: "Item Inv. Book",
    href: "/app/inventory/reports/inv-book",
    hint: "Item × location ledger",
  },
  {
    kind: "serial",
    label: "Serial Inv. Book",
    href: "/app/inventory/serial-lot/reports/book",
    hint: "Serial slip ledger",
  },
  {
    kind: "lot",
    label: "Lot Inv. Book",
    href: "/app/inventory/serial-lot/reports/lot-book",
    hint: "Lot slip ledger",
  },
];

/** Switcher across the three inventory books — keep on every Inv. Book page. */
export const InvBookFamilyNav = (props: { active: InvBookFamilyKind }) => {
  const loc = useLocation();
  return (
    <nav
      class="mb-4 rounded-xl border border-stroke bg-white p-3 shadow-sm"
      aria-label="Inventory book reports"
    >
      <div class="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p class="text-xs font-semibold uppercase tracking-wide text-text-secondary">
          Movement history (Inv. Books)
        </p>
        <A href="/app/inventory/find-stock" class="text-xs font-medium text-brand-700 hover:underline">
          ← Inv. Balance by Location (shelf board)
        </A>
      </div>
      <p class="mb-2 text-[11px] text-text-secondary">
        These ledgers show what moved when. For qty per branch, use Inv. Balance by Location.
      </p>
      <div class="flex flex-wrap gap-2">
        <For each={links}>
          {(link) => {
            const active = () => props.active === link.kind || loc.pathname === link.href;
            return (
              <A
                href={link.href}
                class="rounded-lg px-3 py-2 text-sm transition-colors"
                classList={{
                  "bg-brand-600 font-medium text-white": active(),
                  "border border-stroke text-text-secondary hover:bg-slate-50 hover:text-text-primary": !active(),
                }}
                aria-current={active() ? "page" : undefined}
                title={link.hint}
              >
                <span class="block leading-tight">{link.label}</span>
                <span
                  class="mt-0.5 block text-[11px] leading-tight"
                  classList={{
                    "text-white/80": active(),
                    "text-text-secondary": !active(),
                  }}
                >
                  {link.hint}
                </span>
              </A>
            );
          }}
        </For>
      </div>
    </nav>
  );
};
