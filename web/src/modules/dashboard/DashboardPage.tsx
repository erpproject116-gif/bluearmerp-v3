import { A, useSearchParams } from "@solidjs/router";
import { formatPeso } from "../../shared/money";
import { createMemo, For, Show } from "solid-js";
import { DashboardLayout } from "./DashboardLayout";
import { ReconciliationBanner } from "../../shared/ReconciliationBanner";
import { OnboardingChecklist } from "../../shared/OnboardingChecklist";
import { DayJobsPanel } from "../../shared/DayJobsPanel";
import { HomeFinanceOverview } from "./HomeFinanceOverview";
import { FinancialHealthPanel } from "./FinancialHealthPanel";
import { MyPageLearnPanel } from "./MyPageLearnPanel";
import { MyPageFlowChart } from "./MyPageFlowChart";
import {
  useDashboardInventoryTrend,
  useDashboardRedFlags,
  useDashboardSalesTrend,
  useDashboardSummary,
  useDashboardTopCustomers,
  useDashboardTopItems,
  useDashboardTopVendors,
  type DashboardRedFlagCategory,
} from "../../shared/useDashboard";
import { useOpsIntelligence } from "../../shared/useOpsIntelligence";
import { BiReportCard } from "./BiReportCard";
import { OpsIntelligencePanel } from "./OpsIntelligencePanel";

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
  { label: "Open PO lines", value: (s) => s?.open_po_lines ?? 0, href: "/app/purchase-order/purchase-orders" },
  { label: "Warranty tasks", value: (s) => s?.warranty_due ?? 0, href: "/app/crm/follow-up-tasks" },
  { label: "Expired quotes", value: (s) => s?.expired_quotes ?? 0, href: "/app/quotation/quotations/outstanding", accent: "text-red-600" },
  { label: "Quotes expiring (7d)", value: (s) => s?.quotes_expiring_7d ?? 0, href: "/app/quotation/quotations/outstanding", accent: "text-amber-600" },
  { label: "Unbilled milestones", value: (s) => s?.unbilled_due_milestones ?? 0, href: "/app/finance/acct-ii/contracts", accent: "text-amber-600" },
];

const redFlagLinks: Record<string, string> = {
  low_stock: "/app/crm/reports/low-stock",
  expired_quotes: "/app/quotation/quotations/outstanding",
  serial_qty_mismatch: "/app/inventory/serial-lot/registry",
  reserved_stale: "/app/inventory/serial-lot/registry",
  open_po: "/app/purchase-order/purchase-orders",
  so_release_gap: "/app/sales-order/sales-orders/release",
  reserve_without_dr: "/app/sales-order/delivery-receipts/new",
  dr_without_invoice: "/app/sales/sales/new",
  gr_without_supplier_invoice: "/app/purchases/purchase-receive/new",
  ap_over_application: "/app/finance/payment-vouchers",
  budget_overrun: "/app/finance/reports/budget-vs-actual",
  overdue_ar: "/app/finance/reports/ar-aging",
};

function RankedList(props: { title: string; items: { label: string; value: string }[]; emptyText: string }) {
  return (
    <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
      <h3 class="mb-3 text-sm font-semibold text-text-primary">{props.title}</h3>
      <Show when={props.items.length > 0} fallback={<p class="text-sm text-text-secondary">{props.emptyText}</p>}>
        <ul class="space-y-2">
          <For each={props.items}>
            {(item) => (
              <li class="flex items-center justify-between gap-2 text-sm">
                <span class="min-w-0 truncate text-text-primary">{item.label}</span>
                <span class="shrink-0 font-medium text-text-secondary">{item.value}</span>
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
      <h3 class="mb-3 text-sm font-semibold text-text-primary">
        Red flags <span class="font-normal text-text-secondary">({props.total})</span>
      </h3>
      <Show when={props.categories.length > 0} fallback={<p class="text-sm text-text-secondary">No red flags.</p>}>
        <ul class="divide-y divide-stroke">
          <For each={props.categories}>
            {(cat) => {
              const href = redFlagLinks[cat.code];
              const row = (
                <div class="flex items-center justify-between gap-3 py-2 text-sm">
                  <span class="text-text-primary">{cat.label}</span>
                  <span class="font-semibold text-amber-700">{cat.count}</span>
                </div>
              );
              return href ? <li><A href={href}>{row}</A></li> : <li>{row}</li>;
            }}
          </For>
        </ul>
      </Show>
    </section>
  );
}

export default function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const tab = () => (params.tab === "mypage" ? "mypage" : params.tab === "intel" ? "intel" : "overview");

  const summary = useDashboardSummary();
  const salesTrend = useDashboardSalesTrend();
  const inventoryTrend = useDashboardInventoryTrend();
  const redFlags = useDashboardRedFlags();
  const topCustomers = useDashboardTopCustomers();
  const topVendors = useDashboardTopVendors();
  const topItems = useDashboardTopItems();
  const intelPreview = useOpsIntelligence(() => tab() === "overview");

  const loading = () => summary.isLoading;
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
        <div>
          <h2 class="text-lg font-semibold text-text-primary">
            {tab() === "overview" ? "Business overview" : tab() === "intel" ? "Operations intelligence" : "MyPage"}
          </h2>
          <p class="text-sm text-text-secondary">
            {tab() === "overview"
              ? "KPIs, trends, and financial health for this workspace."
              : tab() === "intel"
                ? "Inventory, sales, open orders, purchases, and follow-ups — with Chart.js and CSV/PNG/PDF export."
                : "Guided home — learn links and process flow."}
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <div class="inline-flex rounded-lg border border-stroke bg-white p-0.5 text-sm shadow-sm">
            <button
              type="button"
              class="rounded-md px-3 py-1.5 font-medium transition"
              classList={{
                "bg-brand-600 text-white": tab() === "overview",
                "text-text-secondary hover:text-text-primary": tab() !== "overview",
              }}
              onClick={() => setParams({ tab: undefined })}
            >
              Business overview
            </button>
            <button
              type="button"
              class="rounded-md px-3 py-1.5 font-medium transition"
              classList={{
                "bg-brand-600 text-white": tab() === "intel",
                "text-text-secondary hover:text-text-primary": tab() !== "intel",
              }}
              onClick={() => setParams({ tab: "intel" })}
            >
              Intelligence
            </button>
            <button
              type="button"
              class="rounded-md px-3 py-1.5 font-medium transition"
              classList={{
                "bg-brand-600 text-white": tab() === "mypage",
                "text-text-secondary hover:text-text-primary": tab() !== "mypage",
              }}
              onClick={() => setParams({ tab: "mypage" })}
            >
              MyPage
            </button>
          </div>
          <A
            href="/app/dashboard/period-summary"
            class="rounded-lg border border-stroke bg-white px-4 py-2 text-sm font-medium text-brand-600 shadow-sm transition hover:shadow-md"
          >
            Period summary
          </A>
          <A
            href="/app/dashboard/approvals"
            class="rounded-lg border border-stroke bg-white px-4 py-2 text-sm font-medium text-brand-600 shadow-sm transition hover:shadow-md"
          >
            Approvals queue
          </A>
        </div>
      </div>

      <Show when={tab() === "mypage"}>
        <div class="mb-6 grid gap-4 lg:grid-cols-2">
          <MyPageLearnPanel />
          <MyPageFlowChart />
        </div>
        <ReconciliationBanner compact />
        <div class="mt-4">
          <OnboardingChecklist compact />
        </div>
        <div class="mt-4">
          <DayJobsPanel />
        </div>
      </Show>

      <Show when={tab() === "overview"}>
        <FinancialHealthPanel />
        <HomeFinanceOverview />

        <Show when={loading()}>
          <p class="text-sm text-text-secondary">Loading dashboard…</p>
        </Show>

        <p class="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-text-secondary">Operations snapshot</p>
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

        <Show when={intelPreview.data}>
          {(d) => (
            <A
              href="/app/dashboard?tab=intel"
              class="mt-4 grid gap-3 rounded-xl border border-stroke bg-white p-4 shadow-sm transition hover:shadow-md sm:grid-cols-4"
            >
              <div>
                <p class="text-xs uppercase tracking-wide text-text-secondary">Open SO headers</p>
                <p class="mt-1 text-xl font-bold text-text-primary">{int(d().sales_orders.open_headers)}</p>
              </div>
              <div>
                <p class="text-xs uppercase tracking-wide text-text-secondary">Classified SO</p>
                <p class="mt-1 text-xl font-bold text-text-primary">{int(d().sales_orders.classified_headers)}</p>
              </div>
              <div>
                <p class="text-xs uppercase tracking-wide text-text-secondary">Open PO headers</p>
                <p class="mt-1 text-xl font-bold text-text-primary">{int(d().purchase_orders.open_headers)}</p>
              </div>
              <div>
                <p class="text-xs uppercase tracking-wide text-text-secondary">Pending approvals</p>
                <p class="mt-1 text-xl font-bold text-text-primary">{int(d().follow_up.pending_approvals)}</p>
              </div>
            </A>
          )}
        </Show>

        <div class="mt-6 grid gap-4 lg:grid-cols-2">
          <BiReportCard
            id="overview-sales-trend"
            title="Sales invoices (12 months)"
            type="bar"
            labels={(salesTrend.data?.points ?? []).map((p) => p.period)}
            values={(salesTrend.data?.points ?? []).map((p) => p.value)}
            valueFormat="money"
            columns={[
              { key: "period", header: "Period", value: (r) => String(r.period ?? "") },
              { key: "value", header: "Amount", value: (r) => Number(r.value ?? 0) },
            ]}
            rows={(salesTrend.data?.points ?? []).map((p) => ({ period: p.period, value: p.value }))}
          />
          <BiReportCard
            id="overview-inbound-trend"
            title="Inbound stock qty (all movement types)"
            caption="Positive stock movements, not goods receipts only."
            type="bar"
            labels={(inventoryTrend.data?.points ?? []).map((p) => p.period)}
            values={(inventoryTrend.data?.points ?? []).map((p) => p.value)}
            valueFormat="int"
            columns={[
              { key: "period", header: "Period", value: (r) => String(r.period ?? "") },
              { key: "value", header: "Qty", value: (r) => Number(r.value ?? 0) },
            ]}
            rows={(inventoryTrend.data?.points ?? []).map((p) => ({ period: p.period, value: p.value }))}
          />
        </div>

        <div class="mt-6">
          <RedFlagsTable categories={redFlags.data?.categories ?? []} total={redFlags.data?.total_count ?? 0} />
        </div>

        <div class="mt-6 grid gap-4 lg:grid-cols-3">
          <RankedList title="Top customers (90d)" items={customerItems()} emptyText="No sales in the last 90 days." />
          <RankedList title="Top vendors (90d)" items={vendorItems()} emptyText="No purchase orders in the last 90 days." />
          <RankedList title="Top selling items (90d)" items={itemItems()} emptyText="No sales lines in the last 90 days." />
        </div>
      </Show>

      <Show when={tab() === "intel"}>
        <OpsIntelligencePanel variant="full" />
      </Show>
    </DashboardLayout>
  );
}
