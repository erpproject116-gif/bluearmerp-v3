import { A } from "@solidjs/router";
import { For } from "solid-js";
import { SerialLotLayout } from "./SerialLotLayout";

const LINKS = [
  {
    title: "Purchase Receive",
    description: "Happy path: confirm posts stock, serials, and AP from a PO (or blank receive).",
    href: "/app/purchases/purchase-receive/new",
  },
  {
    title: "Serials",
    description: "Find units by serial number, status, unit warranty end, and sold coverage. Open a row for detail.",
    href: "/app/inventory/serial-lot/registry",
  },
  {
    title: "Serial detail (lookup)",
    description: "Type or scan a serial to manage unit dates, customer coverage, and history.",
    href: "/app/inventory/serial-lot/trace",
  },
  {
    title: "Lot batches",
    description: "View on-hand lot quantities by location and expiry (stock expiry, not warranty).",
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
  {
    title: "Receive / scan (legacy)",
    description: "Older goods-receipt scan path. Prefer Purchase Receive for new inbound stock.",
    href: "/app/inventory/serial-lot/receive",
  },
  {
    title: "Receive history (legacy)",
    description: "Posted/draft goods receipts for reverse and audit.",
    href: "/app/purchase-request/goods-receipt",
  },
] as const;

export default function SerialLotSettingsPage() {
  return (
    <SerialLotLayout>
      <section class="rounded-xl border border-stroke bg-white p-8 shadow-sm">
        <h2 class="text-lg font-semibold text-text-primary">Serial &amp; lot tracking</h2>
        <p class="mt-2 max-w-2xl text-sm text-text-secondary">
          Configure tracking per item, then capture serials and lots on{" "}
          <strong class="font-medium text-text-primary">Purchase Receive</strong> (inbound) and{" "}
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
            <li>Run reconciliation reports under Serial &amp; Lot → More if counts drift.</li>
          </ul>
        </div>
      </section>
    </SerialLotLayout>
  );
}
