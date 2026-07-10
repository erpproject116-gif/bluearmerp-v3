import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import { useAuth } from "../../shared/auth-context";
import { useSellingWorkspace } from "../../shared/reports/useModuleReports";
import { uiLabel } from "../../shared/branding/uiLabel";

type KpiTile = {
  label: string;
  value: (s: NonNullable<ReturnType<typeof useSellingWorkspace>["data"]>) => number;
  href: string;
  accent?: string;
};

const tiles: KpiTile[] = [
  { label: "Open sales orders", value: (s) => s.open_sales_orders, href: "/app/sales-order/sales-orders/outstanding", accent: "text-brand-600" },
  { label: "Open quotations", value: (s) => s.open_quotations, href: "/app/quotation/quotations/outstanding" },
  { label: "Expired quotations", value: (s) => s.expired_quotations, href: "/app/crm/reports/expired-quotations", accent: "text-red-600" },
  { label: "Pending delivery lines", value: (s) => s.pending_delivery_lines, href: "/app/sales-order/reports/so-analysis", accent: "text-amber-600" },
  { label: "Low stock SKUs", value: (s) => s.low_stock_skus, href: "/app/crm/reports/low-stock", accent: "text-amber-600" },
];

const reportLinks = [
  { label: "Sales Status", href: "/app/selling/reports" },
  { label: "Receivable Status", href: "/app/selling/reports/receivable-status" },
  { label: "SO Analysis", href: "/app/sales-order/reports/so-analysis" },
  { label: "Sales Order Status", href: "/app/sales-order/sales-orders/status" },
  { label: "Sales Invoice Status", href: "/app/sales/sales/status" },
  { label: "A/R by Customer", href: "/app/sales/reports/ar-by-customer" },
  { label: "Expired Quotations", href: "/app/crm/reports/expired-quotations" },
  { label: "Conversion Funnel", href: "/app/crm/reports/conversion" },
];

export default function SellingWorkspacePage() {
  const auth = useAuth();
  const workspace = useSellingWorkspace();

  return (
    <div class="space-y-6">
      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <h2 class="text-lg font-semibold text-text-primary">Selling workspace</h2>
        <p class="text-sm text-text-secondary">{auth.me?.tenant.company_name}</p>
      </section>

      <section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <For each={tiles}>
          {(tile) => (
            <A
              href={tile.href}
              class="rounded-xl border border-stroke bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow-md"
            >
              <p class="text-sm text-text-secondary">{tile.label}</p>
              <p class={`mt-2 text-3xl font-bold ${tile.accent ?? "text-text-primary"}`}>
                {workspace.isLoading ? "…" : (workspace.data ? tile.value(workspace.data) : 0)}
              </p>
            </A>
          )}
        </For>
      </section>

      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <h3 class="mb-4 text-sm font-semibold text-text-primary">Reports</h3>
        <Show when={!workspace.isLoading} fallback={<p class="text-sm text-text-secondary">{uiLabel("common.loading")}</p>}>
          <ul class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
