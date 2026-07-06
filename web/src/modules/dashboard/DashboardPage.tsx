import { A } from "@solidjs/router";
import { formatPeso } from "../../shared/money";
import { createMemo, For, Show } from "solid-js";
import { DashboardLayout } from "./DashboardLayout";
import { OnboardingChecklist } from "../../shared/OnboardingChecklist";
import { ReconciliationBanner } from "../../shared/ReconciliationBanner";
import {
  useDashboardInventoryTrend,
  useDashboardRedFlags,
  useDashboardSalesTrend,
  useDashboardSummary,
  useDashboardTopCustomers,
  useDashboardTopItems,
  useDashboardTopVendors,
  type DashboardRedFlagCategory,
  type DashboardTrendPoint,
} from "../../shared/useDashboard";



function int(n: number) {
  return n.toLocaleString("en-PH", { maximumFractionDigits: 0 });
}

type KpiTile = {
  label: string;
  value: (s: ReturnType<typeof useDashboardSummary>["data"]) => number | string;
  href?: string;
  accent?: string;
  format?: "money" | "int";
};

const kpiTiles: KpiTile[] = [
  { label: "Sales MTD", value: (s) => s?.sales_mtd ?? 0, href: "/app/sales/sales", format: "money" },
  { label: "Sales YTD", value: (s) => s?.sales_ytd ?? 0, href: "/app/sales/sales", format: "money" },
  { label: "Low stock SKUs", value: (s) => s?.low_stock_count ?? 0, href: "/app/crm/reports/low-stock", accent: "text-amber-600" },
  { label: "A/R customers", value: (s) => s?.ar_customers ?? 0, href: "/app/finance/reports/ar-by-customer" },
  { label: "Open PO lines", value: (s) => s?.open_po_lines ?? 0, href: "/app/purchase-request/purchase-orders" },
  { label: "Warranty follow-ups", value: (s) => s?.warranty_due ?? 0, href: "/app/crm/follow-up-tasks" },
  { label: "Expired quotes", value: (s) => s?.expired_quotes ?? 0, href: "/app/quotation/quotations/outstanding", accent: "text-red-600" },
  { label: "Quotes expiring (7d)", value: (s) => s?.quotes_expiring_7d ?? 0, href: "/app/quotation/quotations/outstanding", accent: "text-amber-600" },
];

const redFlagLinks: Record<string, string> = {
  low_stock: "/app/crm/reports/low-stock",
  expired_quotes: "/app/quotation/quotations/outstanding",
  serial_qty_mismatch: "/app/inventory/serial-lot/registry",
  reserved_stale: "/app/inventory/serial-lot/registry",
  open_po: "/app/purchase-request/purchase-orders",
  so_release_gap: "/app/sales-order/sales-orders/release",
  reserve_without_dr: "/app/sales-order/delivery-receipts/new",
  dr_without_invoice: "/app/sales/sales/new",
  gr_without_supplier_invoice: "/app/finance/supplier-invoices/new",
  ap_over_application: "/app/finance/payment-vouchers",
  budget_overrun: "/app/finance/reports/budget-vs-actual",
};

function CssBarChart(props: { title: string; points: DashboardTrendPoint[]; valueFormat?: "money" | "int" }) {
  const max = () => Math.max(...props.points.map((p) => p.value), 1);
  const format = (v: number) => (props.valueFormat === "money" ? formatPeso(v) : int(v));

  return (
    <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
      <h3 class="mb-4 text-sm font-semibold text-text-primary">{props.title}</h3>
      <Show when={props.points.length > 0} fallback={<p class="text-sm text-text-secondary">No data.</p>}>
        <div class="flex items-end gap-1 sm:gap-2" style={{ height: "160px" }}>
          <For each={props.points}>
            {(pt) => {
              const pct = () => Math.max(4, (pt.value / max()) * 100);
              return (
                <div class="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
                  <span class="text-[10px] text-text-secondary" title={format(pt.value)}>
                    {pt.value > 0 ? format(pt.value) : ""}
                  </span>
                  <div
                    class="w-full rounded-t bg-brand-500 transition-all"
                    style={{ height: `${pct()}%`, "min-height": pt.value > 0 ? "4px" : "0" }}
                    title={`${pt.period}: ${format(pt.value)}`}
                  />
                  <span class="truncate text-[10px] text-text-secondary" title={pt.period}>
                    {pt.period.slice(5)}
                  </span>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </section>
  );
}

function RankedList<T extends { label: string; value: string }>(props: {
  title: string;
  items: T[];
  emptyText?: string;
}) {
  return (
    <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
      <h3 class="mb-3 text-sm font-semibold text-text-primary">{props.title}</h3>
      <Show when={props.items.length > 0} fallback={<p class="text-sm text-text-secondary">{props.emptyText ?? "No data."}</p>}>
        <ul class="space-y-2">
          <For each={props.items}>
            {(item) => (
              <li class="flex items-center justify-between gap-2 text-sm">
                <span class="truncate text-text-primary">{item.label}</span>
                <span class="shrink-0 text-text-secondary">{item.value}</span>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </section>
  );
}

function RedFlagsTable(props: { categories: DashboardRedFlagCategory[]; total: number }) {
  return (
    <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
      <div class="mb-3 flex items-center justify-between">
        <h3 class="text-sm font-semibold text-text-primary">Red flags</h3>
        <span class="text-xs text-text-secondary">{int(props.total)} total</span>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="bg-slate-50 text-left text-xs uppercase text-text-secondary">
            <tr>
              <th class="px-3 py-2">Category</th>
              <th class="px-3 py-2 text-right">Count</th>
              <th class="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            <For each={props.categories}>
              {(cat) => {
                const href = redFlagLinks[cat.code];
                const accent = cat.count > 0 ? "text-red-600 font-semibold" : "text-text-primary";
                return (
                  <tr class="border-t border-stroke/60">
                    <td class={`px-3 py-2 ${accent}`}>{cat.label}</td>
                    <td class={`px-3 py-2 text-right ${accent}`}>{int(cat.count)}</td>
                    <td class="px-3 py-2 text-right">
                      <Show when={href && cat.count > 0}>
                        <A href={href!} class="text-xs font-medium text-brand-600 hover:underline">
                          View
                        </A>
                      </Show>
                    </td>
                  </tr>
                );
              }}
            </For>
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function DashboardPage() {
  const summary = useDashboardSummary();
  const salesTrend = useDashboardSalesTrend(12);
  const inventoryTrend = useDashboardInventoryTrend(12);
  const redFlags = useDashboardRedFlags();
  const topCustomers = useDashboardTopCustomers(90, 10);
  const topVendors = useDashboardTopVendors(90, 10);
  const topItems = useDashboardTopItems(90, 10);

  const loading = () =>
    summary.isFetching &&
    !summary.data &&
    salesTrend.isFetching &&
    !salesTrend.data;

  const summaryData = () => summary.data;

  const customerItems = createMemo(() =>
    (topCustomers.data ?? []).map((c) => ({
      label: c.partner_name,
      value: formatPeso(c.total_amount),
    })),
  );

  const vendorItems = createMemo(() =>
    (topVendors.data ?? []).map((v) => ({
      label: v.partner_name,
      value: formatPeso(v.total_amount),
    })),
  );

  const itemItems = createMemo(() =>
    (topItems.data ?? []).map((i) => ({
      label: `${i.item_code} — ${i.item_name}`,
      value: i.qty.toLocaleString("en-PH", { maximumFractionDigits: 4 }),
    })),
  );

  return (
    <DashboardLayout>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-text-secondary">
          Business overview — sales, inventory, purchasing, and operational red flags.
        </p>
        <A
          href="/app/dashboard/approvals"
          class="rounded-lg border border-stroke bg-white px-4 py-2 text-sm font-medium text-brand-600 shadow-sm transition hover:shadow-md"
        >
          Approvals queue
        </A>
      </div>

      <div class="mb-6">
        <OnboardingChecklist compact />
      </div>

      <ReconciliationBanner compact />

      <Show when={loading()}>
        <p class="text-sm text-text-secondary">Loading dashboard…</p>
      </Show>

      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <For each={kpiTiles}>
          {(tile) => {
            const raw = () => tile.value(summaryData());
            const display = () => (tile.format === "money" ? formatPeso(Number(raw())) : int(Number(raw())));
            const inner = (
              <div class="rounded-xl border border-stroke bg-white p-4 shadow-sm transition hover:shadow-md">
                <p class="text-xs font-medium uppercase tracking-wide text-text-secondary">{tile.label}</p>
                <p class={`mt-2 text-2xl font-bold ${tile.accent ?? "text-text-primary"}`}>{display()}</p>
              </div>
            );
            return tile.href ? <A href={tile.href}>{inner}</A> : inner;
          }}
        </For>
      </div>

      <div class="mt-6 grid gap-4 lg:grid-cols-2">
        <CssBarChart title="Sales trend (12 months)" points={salesTrend.data?.points ?? []} valueFormat="money" />
        <CssBarChart title="Inventory receipts (12 months)" points={inventoryTrend.data?.points ?? []} valueFormat="int" />
      </div>

      <div class="mt-6">
        <RedFlagsTable
          categories={redFlags.data?.categories ?? []}
          total={redFlags.data?.total_count ?? 0}
        />
      </div>

      <div class="mt-6 grid gap-4 lg:grid-cols-3">
        <RankedList title="Top customers (90d)" items={customerItems()} emptyText="No sales in the last 90 days." />
        <RankedList title="Top vendors (90d)" items={vendorItems()} emptyText="No purchase orders in the last 90 days." />
        <RankedList title="Top selling items (90d)" items={itemItems()} emptyText="No sales lines in the last 90 days." />
      </div>
    </DashboardLayout>
  );
}
