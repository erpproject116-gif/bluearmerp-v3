import { A } from "@solidjs/router";
import { For } from "solid-js";
import PurchaseStatusPage from "./PurchaseStatusPage";

const reportLinks = [
  { label: "Purchase status", href: "/app/buying/reports/purchase-status" },
  { label: "Payable status", href: "/app/buying/reports/payable-status" },
  { label: "Pre-invoicing", href: "/app/buying/reports/pre-invoicing" },
  { label: "PO analysis", href: "/app/purchase-order/reports/po-analysis" },
  { label: "PO status", href: "/app/purchase-order/purchase-orders?view=status" },
  { label: "Items to receive", href: "/app/purchase-order/reports/items-to-receive" },
  { label: "A/P by vendor", href: "/app/purchases/purchase-receive/ap-by-vendor" },
  { label: "Payment status", href: "/app/purchases/purchase-receive/payment-status" },
  { label: "Purchase invoice status", href: "/app/purchases/purchase-receive?view=status" },
];

/** Mirrors Selling reports: hub links + default Purchase Status table (TK-20260916-005). */
export default function BuyingReportsHubPage() {
  return (
    <div class="space-y-6">
      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <h2 class="text-lg font-semibold text-text-primary">Purchasing reports</h2>
        <p class="mt-1 text-sm text-text-secondary">
          Pick a report below, or use the Purchase Status table on this page (filters + Search / F8).
        </p>
        <ul class="mt-3 flex flex-wrap gap-3 text-sm">
          <For each={reportLinks}>
            {(link) => (
              <li>
                <A href={link.href} class="font-medium text-brand-600 hover:underline">
                  {link.label}
                </A>
              </li>
            )}
          </For>
        </ul>
      </section>
      <PurchaseStatusPage />
    </div>
  );
}
