import { A } from "@solidjs/router";
import { For, Show, createMemo } from "solid-js";
import { hasModuleAccess, hasPermission, useAuth } from "./auth-context";
import { isTenantFeatureEnabled, isTenantModuleEnabled } from "./moduleAccess";
import { useDashboardRedFlags, useDashboardSummary } from "./useDashboard";

type DayJob = {
  id: string;
  title: string;
  blurb: string;
  href: string;
  /** Optional badge count from dashboard. */
  count?: number;
};

/**
 * Role-based “day jobs” — short action list for non-tech users instead of hunting modules.
 */
export function DayJobsPanel() {
  const auth = useAuth();
  const summary = useDashboardSummary();
  const redFlags = useDashboardRedFlags();
  const me = () => auth.me;

  const jobs = createMemo((): DayJob[] => {
    const m = me();
    if (!m) return [];
    const s = summary.data;
    const flags = redFlags.data?.categories ?? [];
    const flagCount = (code: string) => flags.find((c) => c.code === code)?.count ?? 0;
    const list: DayJob[] = [];

    if (
      isTenantModuleEnabled(m, "sales") &&
      (hasModuleAccess(m, "sales") || hasPermission(m, "sales.sales", "write") || hasPermission(m, "sales", "read"))
    ) {
      list.push({
        id: "sell",
        title: "Sell",
        blurb: "Invoice a customer or start from a sales order.",
        href: "/app/sales/sales/new",
        count: (s?.quotes_expiring_7d ?? 0) + flagCount("dr_without_invoice"),
      });
    }
    if (
      isTenantModuleEnabled(m, "sales_order") &&
      (hasModuleAccess(m, "sales_order") || hasPermission(m, "sales_order", "read"))
    ) {
      list.push({
        id: "deliver",
        title: "Deliver / pick",
        blurb: "Release stock and record deliveries.",
        href: "/app/sales-order/sales-orders/release",
        count: flagCount("so_release_gap") + flagCount("reserve_without_dr"),
      });
    }
    if (
      isTenantModuleEnabled(m, "purchase_order") &&
      (hasModuleAccess(m, "purchase_request") ||
        hasModuleAccess(m, "purchase_order") ||
        hasPermission(m, "purchase_request", "read") ||
        hasPermission(m, "purchases", "read"))
    ) {
      list.push({
        id: "receive",
        title: "Receive stock",
        blurb: "Purchase Receive — post stock and serials from a PO.",
        href: "/app/purchases/purchase-receive",
        count: flagCount("open_po") + (s?.open_po_lines ?? 0),
      });
    }
    if (
      isTenantModuleEnabled(m, "purchases") &&
      (hasModuleAccess(m, "purchases") || hasPermission(m, "purchases", "read"))
    ) {
      list.push({
        id: "bill-vendor",
        title: "Bill a supplier",
        blurb: "Create a purchase invoice after receiving.",
        href: "/app/purchases/purchase-receive/new",
        count: flagCount("gr_without_supplier_invoice"),
      });
    }
    if (isTenantModuleEnabled(m, "finance") && (hasModuleAccess(m, "finance") || hasPermission(m, "finance", "read"))) {
      list.push({
        id: "collect",
        title: "Record payment in",
        blurb: "Official receipt when a customer pays.",
        href: "/app/finance/official-receipts",
        count: s?.ar_customers ?? 0,
      });
      if (isTenantFeatureEnabled(m, "finance.payment_vouchers", "finance")) {
        list.push({
          id: "pay",
          title: "Pay a supplier",
          blurb: "Payment voucher for vendor bills.",
          href: "/app/finance/payment-vouchers",
        });
      }
    }
    if (
      isTenantModuleEnabled(m, "pos") &&
      (hasModuleAccess(m, "pos") || hasPermission(m, "pos", "write") || hasPermission(m, "pos", "read"))
    ) {
      list.push({
        id: "pos",
        title: "Open POS",
        blurb: "Ring up walk-in sales at the counter.",
        href: "/app/pos",
      });
    }
    if (isTenantModuleEnabled(m, "hr") && (hasModuleAccess(m, "hr") || hasPermission(m, "hr", "read"))) {
      list.push({
        id: "hr",
        title: "HR & payroll",
        blurb: "Employees, attendance, and payslips.",
        href: "/app/hr/employees",
      });
    }
    if (
      isTenantModuleEnabled(m, "inventory") &&
      (hasPermission(m, "inventory", "read") || hasModuleAccess(m, "inventory"))
    ) {
      list.push({
        id: "stock",
        title: "Check stock",
        blurb: "Low stock and Serials.",
        href: "/app/crm/reports/low-stock",
        count: s?.low_stock_count ?? 0,
      });
    }
    if (
      isTenantModuleEnabled(m, "inventory") &&
      (hasPermission(m, "crm.warranty_assets", "read") ||
        hasPermission(m, "inventory", "read") ||
        hasModuleAccess(m, "inventory"))
    ) {
      list.push({
        id: "customer-warranty",
        title: "Customer warranty list",
        blurb: "Sold serials with customer coverage.",
        href: "/app/after-sales/warranty",
      });
    }

    // Always offer approvals if they can see dashboard
    list.push({
      id: "approvals",
      title: "Approvals",
      blurb: "Documents waiting for your confirmation.",
      href: "/app/dashboard/approvals",
    });

    return list.slice(0, 9);
  });

  const needsAttention = createMemo(() => {
    const flags = (redFlags.data?.categories ?? []).filter((c) => c.count > 0);
    return flags.slice(0, 6);
  });

  const redFlagLinks: Record<string, string> = {
    low_stock: "/app/crm/reports/low-stock",
    expired_quotes: "/app/quotation/quotations?view=outstanding",
    serial_qty_mismatch: "/app/inventory/serial-lot/registry",
    reserved_stale: "/app/inventory/serial-lot/registry",
    open_po: "/app/purchase-order/purchase-orders",
    so_release_gap: "/app/sales-order/sales-orders/release",
    reserve_without_dr: "/app/sales-order/delivery-receipts/new",
    dr_without_invoice: "/app/sales/sales/new",
    gr_without_supplier_invoice: "/app/purchases/purchase-receive/new",
    ap_over_application: "/app/finance/payment-vouchers",
    budget_overrun: "/app/finance/reports/budget-vs-actual",
  };

  return (
    <div class="mb-6 grid gap-4 lg:grid-cols-5">
      <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm lg:col-span-3">
        <h2 class="text-sm font-semibold text-text-primary">My day — common jobs</h2>
        <p class="mt-1 text-xs text-text-secondary">
          Pick what you need to finish. Advanced menus stay in the sidebar when you need them.
        </p>
        <div class="mt-3 grid gap-2 sm:grid-cols-2">
          <For each={jobs()}>
            {(job) => (
              <A
                href={job.href}
                class="flex items-start justify-between gap-2 rounded-lg border border-stroke/80 px-3 py-2.5 transition hover:border-brand-300 hover:bg-brand-50/40"
              >
                <div class="min-w-0">
                  <p class="text-sm font-medium text-text-primary">{job.title}</p>
                  <p class="text-xs text-text-secondary">{job.blurb}</p>
                </div>
                <Show when={(job.count ?? 0) > 0}>
                  <span class="shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-amber-900">
                    {job.count}
                  </span>
                </Show>
              </A>
            )}
          </For>
        </div>
      </section>

      <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm lg:col-span-2">
        <h2 class="text-sm font-semibold text-text-primary">Needs my attention</h2>
        <p class="mt-1 text-xs text-text-secondary">Operational flags with a clear next step.</p>
        <ul class="mt-3 divide-y divide-stroke/60">
          <Show when={needsAttention().length === 0}>
            <li class="py-3 text-sm text-text-secondary">Nothing urgent right now.</li>
          </Show>
          <For each={needsAttention()}>
            {(cat) => (
              <li class="flex items-center justify-between gap-2 py-2 text-sm">
                <span class="text-text-primary">
                  {cat.label}{" "}
                  <span class="font-semibold tabular-nums text-red-600">{cat.count}</span>
                </span>
                <Show when={redFlagLinks[cat.code]}>
                  <A href={redFlagLinks[cat.code]!} class="text-xs font-medium text-brand-600 hover:underline">
                    Fix
                  </A>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </section>
    </div>
  );
}
