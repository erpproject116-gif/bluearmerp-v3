import { A } from "@solidjs/router";
import { For } from "solid-js";
import { SerialLotLayout } from "./SerialLotLayout";

const LINKS = [
  {
    title: "Receive / scan (purchase)",
    description: "Create a goods receipt from a PO, scan serial numbers, and enter lot batches before posting.",
    href: "/app/inventory/serial-lot/receive",
  },
  {
    title: "Goods receipt list",
    description: "Open a draft GR and use the inline scan panel for serials and lots.",
    href: "/app/purchase-request/goods-receipt",
  },
  {
    title: "Serial registry & trace",
    description: "Look up units by serial number, status, and movement history.",
    href: "/app/inventory/serial-lot/registry",
  },
  {
    title: "Lot batches",
    description: "View on-hand lot quantities by location and expiry.",
    href: "/app/inventory/serial-lot/lots",
  },
  {
    title: "Item master — serial/lot tab",
    description: "Enable Track serial or Track lot and set required/optional capture policy per item.",
    href: "/app/inventory/items",
  },
  {
    title: "Sales invoice",
    description: "Scan serials or pick lot batches on invoice lines (not on sales orders).",
    href: "/app/sales/sales",
  },
  {
    title: "Point of sale",
    description: "Barcode scan for serial-tracked items; lot picker on cart lines for lot-tracked items.",
    href: "/app/pos",
  },
] as const;

export default function SerialLotSettingsPage() {
  return (
    <SerialLotLayout>
      <section class="rounded-xl border border-stroke bg-white p-8 shadow-sm">
        <h2 class="text-lg font-semibold text-text-primary">Serial &amp; lot tracking</h2>
        <p class="mt-2 max-w-2xl text-sm text-text-secondary">
          Configure tracking per item, then capture serials and lots on{" "}
          <strong class="font-medium text-text-primary">goods receipt</strong> (purchase/inbound) and{" "}
          <strong class="font-medium text-text-primary">sales invoice</strong> or{" "}
          <strong class="font-medium text-text-primary">POS</strong> (outbound). Purchase orders and sales orders
          only store planned serial numbers — physical scan happens at receive and sale.
        </p>

        <div class="mt-6 grid gap-3 md:grid-cols-2">
          <For each={LINKS}>
            {(link) => (
              <A
                href={link.href}
                class="block rounded-lg border border-stroke px-4 py-3 transition hover:border-brand-300 hover:bg-brand-50/40"
              >
                <p class="text-sm font-medium text-brand-800">{link.title}</p>
                <p class="mt-1 text-xs text-text-secondary">{link.description}</p>
              </A>
            )}
          </For>
        </div>

        <div class="mt-8 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p class="font-medium">Policy tips</p>
          <ul class="mt-2 list-disc space-y-1 pl-5 text-xs">
            <li>Serial and lot tracking are mutually exclusive on one item.</li>
            <li>Required policy blocks posting/checkout until serials or lots are captured.</li>
            <li>Run reconciliation reports under Serial &amp; Lot → Reports if counts drift.</li>
          </ul>
        </div>
      </section>
    </SerialLotLayout>
  );
}
