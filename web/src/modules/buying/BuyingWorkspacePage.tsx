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
  { label: "Unpaid supplier invoices", value: (s) => s.unpaid_invoices, href: "/app/finance/payables", accent: "text-red-600" },
];

const reportLinks = [
  { label: "New Payable Payment", href: "/app/finance/payables" },
  { label: "Purchase Status", href: "/app/buying/reports/purchase-status" },
  { label: "Pre-Invoicing (Purchases)", href: "/app/buying/reports/pre-invoicing" },
  { label: "Payable Status", href: "/app/buying/reports/payable-status" },
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
        <p class="text-sm text-text-secondary">{auth.me?.tenant.company_name}</p>
        <p class="mt-1 text-sm text-text-secondary">Request-to-pay shortcuts and purchasing reports.</p>
      </section>

      <section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <A
          href="/app/purchase-request/purchase-requests/new"
          class="rounded-xl border border-brand-200 bg-brand-50/70 p-5 shadow-sm transition hover:border-brand-400 hover:shadow-md"
        >
          <p class="text-xs font-semibold uppercase tracking-wide text-brand-700">Ask to buy</p>
          <h2 class="mt-1 text-lg font-semibold text-text-primary">New purchase request</h2>
          <p class="mt-2 text-sm text-text-secondary">Internal requisition before sending a PO to a vendor.</p>
        </A>
        <A
          href="/app/purchase-order/purchase-orders"
          class="rounded-xl border border-brand-200 bg-brand-50/70 p-5 shadow-sm transition hover:border-brand-400 hover:shadow-md"
        >
          <p class="text-xs font-semibold uppercase tracking-wide text-brand-700">Order from vendor</p>
          <h2 class="mt-1 text-lg font-semibold text-text-primary">Purchase orders</h2>
          <p class="mt-2 text-sm text-text-secondary">Create or confirm POs and track open lines.</p>
        </A>
        <A
          href="/app/purchases/purchase-receive/new"
          class="rounded-xl border border-brand-200 bg-brand-50/70 p-5 shadow-sm transition hover:border-brand-400 hover:shadow-md"
        >
          <p class="text-xs font-semibold uppercase tracking-wide text-brand-700">Receive stock</p>
          <h2 class="mt-1 text-lg font-semibold text-text-primary">New purchase receive</h2>
          <p class="mt-2 text-sm text-text-secondary">Primary buy path — increase stock and record AP.</p>
        </A>
        <A
          href="/app/finance/payables"
          class="rounded-xl border border-brand-200 bg-brand-50/70 p-5 shadow-sm transition hover:border-brand-400 hover:shadow-md"
        >
          <p class="text-xs font-semibold uppercase tracking-wide text-brand-700">Pay vendors</p>
          <h2 class="mt-1 text-lg font-semibold text-text-primary">New payable payment</h2>
          <p class="mt-2 text-sm text-text-secondary">Settle open supplier balances with a payment voucher.</p>
        </A>
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
