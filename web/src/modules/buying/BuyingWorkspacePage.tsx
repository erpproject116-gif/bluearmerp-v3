import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import { useAuth } from "../../shared/auth-context";
import { useBuyingWorkspace } from "../../shared/reports/useModuleReports";

type KpiTile = {
  label: string;
  value: (s: NonNullable<ReturnType<typeof useBuyingWorkspace>["data"]>) => number;
  href: string;
  accent?: string;
};

const tiles: KpiTile[] = [
  { label: "Open purchase orders", value: (s) => s.open_purchase_orders, href: "/app/purchase-order/purchase-orders" },
  { label: "Open RFQ", value: (s) => s.open_rfq, href: "/app/purchase-order/rfq" },
  { label: "Pending receipt rows", value: (s) => s.pending_receipt_rows, href: "/app/purchase-order/reports/items-to-receive", accent: "text-amber-600" },
  { label: "Unpaid supplier invoices", value: (s) => s.unpaid_invoices, href: "/app/purchases/purchases", accent: "text-red-600" },
];

const reportLinks = [
  { label: "Purchase Status", href: "/app/buying/reports/purchase-status" },
  { label: "PO Analysis", href: "/app/purchase-order/reports/po-analysis" },
  { label: "Items to Receive", href: "/app/purchase-order/reports/items-to-receive" },
  { label: "A/P by Vendor", href: "/app/finance/reports/ap-by-vendor" },
  { label: "A/P Aging", href: "/app/finance/reports/ap-aging" },
];

export default function BuyingWorkspacePage() {
  const auth = useAuth();
  const workspace = useBuyingWorkspace();

  return (
    <div class="space-y-6">
      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <h2 class="text-lg font-semibold text-text-primary">Buying workspace</h2>
        <p class="text-sm text-text-secondary">{auth.me?.tenant.company_name}</p>
      </section>

      <section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <For each={tiles}>
          {(tile) => (
            <A
              href={tile.href}
              class="rounded-xl border border-stroke bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow-md"
            >
              <p class="text-sm text-text-secondary">{tile.label}</p>
              <p class={`mt-2 text-3xl font-bold ${tile.accent ?? "text-text-primary"}`}>
                {workspace.isLoading ? "..." : (workspace.data ? tile.value(workspace.data) : 0)}
              </p>
            </A>
          )}
        </For>
      </section>

      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <h3 class="mb-4 text-sm font-semibold text-text-primary">Reports</h3>
        <Show when={!workspace.isLoading} fallback={<p class="text-sm text-text-secondary">Loading...</p>}>
          <ul class="grid gap-2 sm:grid-cols-2">
            <For each={reportLinks}>
              {(link) => (
                <li>
                  <A href={link.href} class="text-sm font-medium text-brand-600 hover:underline">
                    {link.label}
                  </A>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </section>
    </div>
  );
}
