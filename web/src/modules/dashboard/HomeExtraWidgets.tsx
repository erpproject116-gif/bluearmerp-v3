import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import { formatMoney } from "../../shared/money";
import {
  useDashboardInventoryTrend,
  useDashboardSalesTrend,
  useDashboardTopCustomers,
  useDashboardTopItems,
} from "../../shared/useDashboard";
import { useFinancialHealth } from "../../shared/useFinancialHealth";
import { BiReportCard } from "./BiReportCard";
import type { HomeWidgetId } from "./homeWidgets";

function RankList(props: {
  title: string;
  href: string;
  empty: string;
  rows: { label: string; value: string }[];
}) {
  return (
    <section class="rounded-xl border border-stroke bg-surface p-5 shadow-sm">
      <div class="mb-3 flex items-center justify-between gap-2">
        <h3 class="text-sm font-semibold text-text-primary">{props.title}</h3>
        <A href={props.href} class="text-xs font-medium text-brand-600 hover:underline">
          Open
        </A>
      </div>
      <Show when={props.rows.length > 0} fallback={<p class="text-sm text-text-secondary">{props.empty}</p>}>
        <ol class="space-y-2">
          <For each={props.rows}>
            {(row, i) => (
              <li class="flex items-baseline justify-between gap-3 text-sm">
                <span class="min-w-0 truncate text-text-primary">
                  <span class="mr-2 text-xs tabular-nums text-text-secondary">{i() + 1}.</span>
                  {row.label}
                </span>
                <span class="shrink-0 tabular-nums text-text-secondary">{row.value}</span>
              </li>
            )}
          </For>
        </ol>
      </Show>
    </section>
  );
}

export function HomeExtraWidget(props: { id: HomeWidgetId }) {
  const sales = useDashboardSalesTrend(12, props.id === "sales_trend");
  const stock = useDashboardInventoryTrend(12, props.id === "inventory_trend");
  const customers = useDashboardTopCustomers(90, 8, props.id === "top_customers");
  const items = useDashboardTopItems(90, 8, props.id === "top_items");
  const health = useFinancialHealth(props.id === "cash_in_out" || props.id === "overdue");

  const salesLabels = () => (sales.data?.points ?? []).map((p) => p.period);
  const salesValues = () => (sales.data?.points ?? []).map((p) => p.value);
  const stockLabels = () => (stock.data?.points ?? []).map((p) => p.period);
  const stockValues = () => (stock.data?.points ?? []).map((p) => p.value);

  const cashMonths = () => health.data?.cash.months ?? [];
  const cashLabels = () => cashMonths().map((m) => m.period.slice(5));
  const cashNet = () => cashMonths().map((m) => m.net);

  const overdue = () => (health.data?.overdue_alerts ?? []).slice(0, 8);

  switch (props.id) {
    case "sales_trend":
      return (
        <BiReportCard
          id="home-sales-trend"
          title="Sales by month"
          caption="Posted sales invoices"
          type="bar"
          labels={salesLabels()}
          values={salesValues()}
          datasetLabel="Sales"
          valueFormat="money"
          height={180}
          columns={[
            { key: "period", header: "Month", value: (r) => String(r.period ?? "") },
            { key: "value", header: "Amount", value: (r) => Number(r.value ?? 0) },
          ]}
          rows={(sales.data?.points ?? []).map((p) => ({ period: p.period, value: p.value }))}
          hideExport
          emptyText="No sales in this period yet."
        />
      );
    case "inventory_trend":
      return (
        <BiReportCard
          id="home-inventory-trend"
          title="Stock movement"
          caption="Quantity moved by month"
          type="bar"
          labels={stockLabels()}
          values={stockValues()}
          datasetLabel="Qty"
          valueFormat="int"
          height={180}
          columns={[
            { key: "period", header: "Month", value: (r) => String(r.period ?? "") },
            { key: "value", header: "Qty", value: (r) => Number(r.value ?? 0) },
          ]}
          rows={(stock.data?.points ?? []).map((p) => ({ period: p.period, value: p.value }))}
          hideExport
          emptyText="No stock movements in this period yet."
        />
      );
    case "top_customers":
      return (
        <RankList
          title="Top customers"
          href="/app/inventory/partners"
          empty="No customer sales in the last 90 days."
          rows={(customers.data ?? []).map((r) => ({
            label: r.partner_name,
            value: formatMoney(r.total_amount),
          }))}
        />
      );
    case "top_items":
      return (
        <RankList
          title="Top items"
          href="/app/inventory/items"
          empty="No item sales in the last 90 days."
          rows={(items.data ?? []).map((r) => ({
            label: r.item_name || r.item_code,
            value: String(r.qty),
          }))}
        />
      );
    case "cash_in_out":
      return (
        <BiReportCard
          id="home-cash-net"
          title="Money in vs out"
          caption="Net cash by month from posted journals"
          type="bar"
          labels={cashLabels()}
          values={cashNet()}
          datasetLabel="Net"
          valueFormat="money"
          height={180}
          columns={[
            { key: "period", header: "Month", value: (r) => String(r.period ?? "") },
            { key: "net", header: "Net", value: (r) => Number(r.net ?? 0) },
          ]}
          rows={cashMonths().map((m) => ({ period: m.period, net: m.net }))}
          hideExport
          emptyText="No cash journals yet."
        />
      );
    case "overdue":
      return (
        <section class="rounded-xl border border-stroke bg-surface p-5 shadow-sm">
          <div class="mb-3 flex items-center justify-between gap-2">
            <h3 class="text-sm font-semibold text-text-primary">Overdue invoices</h3>
            <A href="/app/finance/receivables" class="text-xs font-medium text-brand-600 hover:underline">
              Collect
            </A>
          </div>
          <Show
            when={overdue().length > 0}
            fallback={<p class="text-sm text-text-secondary">No overdue customer invoices.</p>}
          >
            <ul class="space-y-2">
              <For each={overdue()}>
                {(row) => (
                  <li class="flex items-baseline justify-between gap-3 text-sm">
                    <span class="min-w-0 truncate text-text-primary">
                      {row.sales_no} · {row.customer_name}
                    </span>
                    <span class="shrink-0 tabular-nums text-amber-800">{formatMoney(row.balance)}</span>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </section>
      );
    default:
      return null;
  }
}
