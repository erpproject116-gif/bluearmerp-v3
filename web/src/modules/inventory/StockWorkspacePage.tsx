import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import { useAuth } from "../../shared/auth-context";
import { useInventoryWorkspace, useLowStockAlerts } from "../../shared/reports/useModuleReports";
import { ReconciliationBanner } from "../../shared/ReconciliationBanner";

type KpiTile = {
  label: string;
  value: (s: NonNullable<ReturnType<typeof useInventoryWorkspace>["data"]>) => number;
  href: string;
  accent?: string;
};

const tiles: KpiTile[] = [
  { label: "Active items", value: (s) => s.active_items, href: "/app/inventory/items" },
  { label: "Active locations", value: (s) => s.active_locations, href: "/app/inventory/locations" },
  { label: "Low stock SKUs", value: (s) => s.low_stock_skus, href: "/app/inventory/reports/on-hand?below_safety=1", accent: "text-amber-600" },
  { label: "Negative stock SKUs", value: (s) => s.negative_stock_skus, href: "/app/inventory/stock-reconciliation", accent: "text-red-600" },
  { label: "Open stock entries", value: (s) => s.open_stock_entries, href: "/app/inventory/stock-entries" },
];

const reportLinks = [
  { label: "Inventory Balance (on hand)", href: "/app/inventory/reports/on-hand" },
  { label: "Inv. Book", href: "/app/inventory/reports/inv-book" },
  { label: "Stock Balance", href: "/app/inventory/reports/stock-balance" },
  { label: "Stock Ledger", href: "/app/inventory/reports/stock-ledger" },
  { label: "Serial/Lot Status", href: "/app/inventory/serial-lot/reports/status" },
  { label: "Serial Inv. Book", href: "/app/inventory/serial-lot/reports/book" },
  { label: "Stock Ageing", href: "/app/inventory/reports/stock-ageing" },
  { label: "Stock Reconciliation", href: "/app/inventory/stock-reconciliation" },
];

export default function StockWorkspacePage() {
  const auth = useAuth();
  const workspace = useInventoryWorkspace();
  const alerts = useLowStockAlerts();

  return (
    <div class="space-y-6">
      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <p class="text-sm text-text-secondary">{auth.me?.tenant.company_name}</p>
        <p class="mt-1 text-sm text-text-secondary">
          Quick links to items, locations, movement reports, and stock reconciliation.
        </p>
      </section>

      <ReconciliationBanner />

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

      <Show when={(alerts.data?.length ?? 0) > 0}>
        <section class="rounded-xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm">
          <div class="mb-3 flex items-center justify-between">
            <h3 class="text-sm font-semibold text-amber-900">Safety stock alerts</h3>
            <A href="/app/inventory/reports/on-hand" class="text-xs font-medium text-brand-600 hover:underline">
              View all on-hand
            </A>
          </div>
          <ul class="divide-y divide-amber-200/60 text-sm">
            <For each={alerts.data ?? []}>
              {(row) => (
                <li class="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span class="font-medium">{row.item_code}</span> — {row.location_name}
                  </span>
                  <span class="text-amber-800">
                    {row.qty_on_hand.toLocaleString()} on hand · reorder {row.reorder_level.toLocaleString()} · short{" "}
                    {row.shortfall.toLocaleString()}
                  </span>
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>

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
