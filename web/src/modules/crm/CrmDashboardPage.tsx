import { A } from "@solidjs/router";
import { For, Show, createMemo } from "solid-js";
import { canViewCrmAnalytics, useAuth } from "../../shared/auth-context";
import { useCrmDashboard, type CrmDashboardSummary } from "../../shared/useCrmDashboard";
import { CrmLayout } from "./CrmLayout";

type KpiTile = {
  label: string;
  value: (s: CrmDashboardSummary) => number | string;
  href?: string;
  accent?: string;
  analyticsOnly?: boolean;
};

const tiles: KpiTile[] = [
  { label: "Expired quotations", value: (s) => s.expired_quotations_count ?? 0, href: "/app/crm/pipelines/quotations", accent: "text-red-600" },
  { label: "Quotes expiring (7d)", value: (s) => s.quotes_expiring_7d ?? 0, href: "/app/crm/pipelines/quotations", accent: "text-amber-600" },
  {
    label: "Not converted to SO",
    value: (s) => s.quotes_not_converted_to_so ?? 0,
    href: "/app/crm/reports/conversion",
    analyticsOnly: true,
  },
  {
    label: "Not sold after release",
    value: (s) => s.quotes_not_converted_to_sales ?? 0,
    href: "/app/crm/reports/conversion",
    analyticsOnly: true,
  },
  {
    label: "Low stock SKUs",
    value: (s) => s.low_stock_sku_count ?? 0,
    href: "/app/crm/reports/low-stock",
    accent: "text-amber-600",
    analyticsOnly: true,
  },
  { label: "Warranty follow-ups due", value: (s) => s.warranty_follow_ups_due ?? 0, href: "/app/crm/follow-up-tasks" },
  { label: "Unread notifications", value: (s) => s.unread_notifications_count ?? 0, href: "/app/crm/notifications" },
  { label: "Quotes missing validity", value: (s) => s.quotes_missing_validity_count ?? 0 },
  {
    label: "A/R customers with balance",
    value: (s) => s.customers_with_ar_balance ?? 0,
    href: "/app/finance/reports/ar-by-customer",
    analyticsOnly: true,
  },
];

function TopList(props: { title: string; items: { item_code: string; item_name: string; qty?: number; count?: number }[]; href: string }) {
  return (
    <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
      <div class="mb-3 flex items-center justify-between">
        <h3 class="text-sm font-semibold text-text-primary">{props.title}</h3>
        <A href={props.href} class="text-xs font-medium text-brand-600 hover:underline">
          View report
        </A>
      </div>
      <Show
        when={props.items.length > 0}
        fallback={<p class="text-sm text-text-secondary">No data for the last 90 days.</p>}
      >
        <ul class="space-y-2">
          <For each={props.items}>
            {(item) => (
              <li class="flex items-center justify-between text-sm">
                <span class="truncate text-text-primary">
                  {item.item_code} — {item.item_name}
                </span>
                <span class="ml-2 shrink-0 text-text-secondary">{item.qty ?? item.count ?? 0}</span>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </section>
  );
}

export default function CrmDashboardPage() {
  const auth = useAuth();
  const dash = useCrmDashboard();
  const summary = () => dash.data ?? ({} as CrmDashboardSummary);
  const analytics = () => canViewCrmAnalytics(auth.me);
  const visibleTiles = createMemo(() =>
    tiles.filter((t) => !t.analyticsOnly || analytics()),
  );

  return (
    <CrmLayout>
      <div class="mb-4">
        <p class="text-sm text-text-secondary">
          {summary().scoped_view
            ? "Your assigned quotations, sales, warranty follow-ups, and tasks."
            : "Key metrics from quotations, sales, inventory, and warranty follow-ups."}
        </p>
      </div>

      <Show when={dash.isFetching && !dash.data}>
        <p class="text-sm text-text-secondary">Loading dashboard…</p>
      </Show>

      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <For each={visibleTiles()}>
          {(tile) => {
            const val = () => tile.value(summary());
            const href =
              tile.analyticsOnly && !analytics()
                ? undefined
                : tile.href?.includes("/reports/") && !analytics()
                  ? "/app/crm/pipelines/quotations"
                  : tile.href;
            const inner = (
              <div class="rounded-xl border border-stroke bg-white p-4 shadow-sm transition hover:shadow-md">
                <p class="text-xs font-medium uppercase tracking-wide text-text-secondary">{tile.label}</p>
                <p class={`mt-2 text-3xl font-bold ${tile.accent ?? "text-text-primary"}`}>{val()}</p>
              </div>
            );
            return href ? <A href={href}>{inner}</A> : inner;
          }}
        </For>
      </div>

      <div class="mt-6 grid gap-4 lg:grid-cols-2">
        <TopList
          title={analytics() ? "Top selling items (90d)" : "My top selling items (90d)"}
          items={summary().top_selling_items ?? []}
          href={analytics() ? "/app/crm/reports/item-demand" : "/app/crm/pipelines/quotations"}
        />
        <TopList
          title={analytics() ? "Top quoted items (90d)" : "My top quoted items (90d)"}
          items={summary().top_quoted_items ?? []}
          href={analytics() ? "/app/crm/reports/customer-quotations" : "/app/crm/pipelines/quotations"}
        />
      </div>
    </CrmLayout>
  );
}
