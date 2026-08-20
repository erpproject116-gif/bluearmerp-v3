import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import { hasPermission, useAuth } from "../../shared/auth-context";
import { entityRecordHref } from "../../shared/entityRoutes";
import { useActivityLogList, type ActivityLogRow } from "../../shared/useActivityLogList";

const FEED_TYPES = new Set([
  "sa_sales",
  "fin_official_receipt",
  "fin_payment_voucher",
  "inv_stock_adjustment_request",
  "inv_stock_entry",
  "so_sales_order",
  "po_purchase_order",
  "fin_supplier_invoice",
  "quo_quotation",
]);

function friendlyLine(row: ActivityLogRow): string {
  const ref = row.reference_no || row.reference_label || row.entity_label || "";
  switch (row.target_type) {
    case "sa_sales":
      return ref ? `Sale ${ref}` : "Sale recorded";
    case "fin_official_receipt":
      return ref ? `Payment received ${ref}` : "Customer payment received";
    case "fin_payment_voucher":
      return ref ? `Vendor paid ${ref}` : "Vendor payment recorded";
    case "inv_stock_adjustment_request":
      return ref ? `Stock adjusted ${ref}` : "Stock adjustment";
    case "inv_stock_entry":
      return ref ? `Stock movement ${ref}` : "Stock movement";
    case "so_sales_order":
      return ref ? `Sales order ${ref}` : "Sales order";
    case "po_purchase_order":
      return ref ? `Purchase order ${ref}` : "Purchase order";
    case "fin_supplier_invoice":
      return ref ? `Purchase receive ${ref}` : "Purchase receive";
    case "quo_quotation":
      return ref ? `Quotation ${ref}` : "Quotation";
    default:
      return row.summary || row.action_code.replace(/_/g, " ");
  }
}

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    const now = Date.now();
    const diff = Math.round((now - d.getTime()) / 1000);
    if (diff < 90) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString();
  } catch {
    return "";
  }
}

export function HomeRecentActivity() {
  const auth = useAuth();
  const canRead = () => hasPermission(auth.me, "activity_logs.logs", "read") || hasPermission(auth.me, "dashboard.view", "read");
  const list = useActivityLogList(() => ({
    page: 1,
    pageSize: 12,
    sort: "created_at",
    order: "desc",
    enabled: Boolean(auth.me) && canRead(),
  }));

  const rows = () => {
    const all = list.data?.rows ?? [];
    const preferred = all.filter((r) => FEED_TYPES.has(r.target_type));
    return (preferred.length > 0 ? preferred : all).slice(0, 8);
  };

  return (
    <section class="rounded-xl border border-stroke bg-surface p-5 shadow-sm">
      <div class="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 class="text-sm font-semibold text-text-primary">Recent activity</h3>
          <p class="mt-0.5 text-xs text-text-secondary">Sales, payments, and stock in this workspace.</p>
        </div>
        <A href="/app/activity-logs" class="text-xs font-medium text-brand-600 hover:underline">
          View all
        </A>
      </div>
      <Show when={!list.isFetching && rows().length === 0}>
        <p class="text-sm text-text-secondary">Nothing recorded yet. New sales, payments, and stock moves will show up here.</p>
      </Show>
      <Show when={list.isFetching && rows().length === 0}>
        <p class="text-sm text-text-secondary">Loading activity…</p>
      </Show>
      <ul class="divide-y divide-stroke/70">
        <For each={rows()}>
          {(row) => {
            const href = () =>
              row.target_id ? entityRecordHref(row.target_type, row.target_id) : "/app/activity-logs";
            return (
              <li class="py-2">
                <A href={href() ?? "/app/activity-logs"} class="flex items-baseline justify-between gap-3 hover:text-brand-700">
                  <span class="min-w-0 truncate text-sm text-text-primary">{friendlyLine(row)}</span>
                  <span class="shrink-0 text-xs text-text-secondary">{formatWhen(row.created_at)}</span>
                </A>
              </li>
            );
          }}
        </For>
      </ul>
    </section>
  );
}
