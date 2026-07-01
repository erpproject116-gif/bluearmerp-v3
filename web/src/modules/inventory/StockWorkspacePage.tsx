import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import { useAuth } from "../../shared/auth-context";
import { useInventoryWorkspace } from "../../shared/reports/useModuleReports";

type KpiTile = {
  label: string;
  value: (s: NonNullable<ReturnType<typeof useInventoryWorkspace>["data"]>) => number;
  href: string;
  accent?: string;
};

const tiles: KpiTile[] = [
  { label: "Active items", value: (s) => s.active_items, href: "/app/inventory/items" },
  { label: "Active locations", value: (s) => s.active_locations, href: "/app/inventory/locations" },
  { label: "Low stock SKUs", value: (s) => s.low_stock_skus, href: "/app/inventory/reports/stock-balance", accent: "text-amber-600" },
  { label: "Negative stock SKUs", value: (s) => s.negative_stock_skus, href: "/app/inventory/stock-reconciliation", accent: "text-red-600" },
  { label: "Open stock entries", value: (s) => s.open_stock_entries, href: "/app/inventory/stock-entries" },
];

const reportLinks = [
  { label: "Stock Balance", href: "/app/inventory/reports/stock-balance" },
  { label: "Stock Ledger", href: "/app/inventory/reports/stock-ledger" },
  { label: "Stock Ageing", href: "/app/inventory/reports/stock-ageing" },
  { label: "Stock Reconciliation", href: "/app/inventory/stock-reconciliation" },
];

export default function StockWorkspacePage() {
  const auth = useAuth();
  const workspace = useInventoryWorkspace();

  return (
    <div class="space-y-6">
      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <h2 class="text-lg font-semibold text-text-primary">Stock workspace</h2>
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
                {workspace.isLoading ? "..." : (workspace.data ? tile.value(workspace.data) : 0)}
              </p>
            </A>
          )}
        </For>
      </section>

      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <h3 class="mb-4 text-sm font-semibold text-text-primary">Reports</h3>
        <Show when={!workspace.isLoading} fallback={<p class="text-sm text-text-secondary">Loading...</p>}>
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
