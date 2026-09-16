import { A } from "@solidjs/router";
import { For, Show, createMemo } from "solid-js";
import { formatPeso } from "../../shared/money";
import type { BiPdfSection } from "../../shared/charts/biExport";
import { downloadBiCsv, downloadBiPdf } from "../../shared/charts/biExport";
import type { GridExportColumn } from "../../shared/gridExport";
import { useOpsIntelligence, type OpsClassifiedBlock, type OpsIntelligence } from "../../shared/useOpsIntelligence";
import { BiDocTable, BiReportCard } from "./BiReportCard";

function int(n: number) {
  return n.toLocaleString("en-PH", { maximumFractionDigits: 0 });
}

const countCols: GridExportColumn[] = [
  { key: "label", header: "Label", value: (r) => String(r.label ?? "") },
  { key: "count", header: "Count", value: (r) => Number(r.count ?? 0) },
];

const qtyCols: GridExportColumn[] = [
  { key: "label", header: "Type", value: (r) => String(r.label ?? "") },
  { key: "qty", header: "Qty", value: (r) => Number(r.qty ?? 0) },
];

const trendCols: GridExportColumn[] = [
  { key: "period", header: "Period", value: (r) => String(r.period ?? "") },
  { key: "value", header: "Value", value: (r) => Number(r.value ?? 0) },
];

const amountCols: GridExportColumn[] = [
  { key: "label", header: "Name", value: (r) => String(r.label ?? "") },
  { key: "amount", header: "Amount", value: (r) => Number(r.amount ?? 0) },
];

const followCols: GridExportColumn[] = [
  { key: "title", header: "Task", value: (r) => String(r.title ?? "") },
  { key: "stage", header: "Stage", value: (r) => String(r.stage ?? "") },
  { key: "due_date", header: "Due", value: (r) => String(r.due_date ?? "") },
];

function reasonChart(block: OpsClassifiedBlock) {
  const rows = (block.by_reason ?? []).filter((r) => r.count > 0);
  return {
    labels: rows.map((r) => r.label),
    values: rows.map((r) => r.count),
    exportRows: (block.by_reason ?? []).map((r) => ({ label: r.label, count: r.count })),
  };
}

export function OpsIntelligencePanel(props: { variant: "full" | "period" }) {
  const q = useOpsIntelligence(true);
  const exporters = new Map<string, () => BiPdfSection>();

  const registerExport = (id: string, get: () => BiPdfSection) => {
    exporters.set(id, get);
    return () => {
      exporters.delete(id);
    };
  };

  const data = createMemo(() => q.data);

  const exportAll = () => {
    const d = data();
    const sections = [...exporters.values()].map((get) => get());
    if (sections.length === 0) return;
    downloadBiPdf(`ops-intelligence-${d?.as_of ?? "export"}.pdf`, sections);
  };

  return (
    <div class="space-y-6">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-text-secondary">Operations intelligence</p>
          <Show when={props.variant === "period"}>
            <p class="mt-1 text-xs text-text-secondary">
              Open now, not limited to the period window. Period KPIs above still use the selected week or month.
            </p>
          </Show>
          <Show when={props.variant === "full"}>
            <p class="mt-1 text-xs text-text-secondary">
              Open sales-order headers (progress not completed) are a different total from classified headers, which also
              include completed documents that still have a fulfillment gap. Pending shipment is a shipping remainder —
              open{" "}
              <A href="/app/sales-order/reports/pending-shipment" class="text-brand-600 hover:underline">
                Pending shipment
              </A>
              .
            </p>
          </Show>
        </div>
        <Show when={props.variant === "full"}>
          <button
            type="button"
            class="rounded-lg border border-stroke bg-white px-3 py-1.5 text-sm font-medium text-text-primary shadow-sm hover:bg-slate-50"
            onClick={exportAll}
          >
            Export all PDF
          </button>
        </Show>
      </div>

      <Show when={q.isLoading}>
        <p class="text-sm text-text-secondary">Loading operations intelligence…</p>
      </Show>
      <Show when={q.isError}>
        <p class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {(q.error as Error)?.message ?? "Could not load operations intelligence."}
        </p>
      </Show>

      <Show when={data()}>
        {(d) => (
          <>
            <Show when={props.variant === "full"}>
              <InventorySection d={d()} asOf={d().as_of} registerExport={registerExport} />
              <SalesSection d={d()} asOf={d().as_of} registerExport={registerExport} />
            </Show>
            <SalesOrderSection block={d().sales_orders} asOf={d().as_of} registerExport={registerExport} />
            <PurchaseOrderSection block={d().purchase_orders} asOf={d().as_of} registerExport={registerExport} />
            <Show when={props.variant === "full"}>
              <PurchasesSection d={d()} asOf={d().as_of} registerExport={registerExport} />
            </Show>
            <FollowUpSection d={d()} asOf={d().as_of} registerExport={registerExport} />
          </>
        )}
      </Show>
    </div>
  );
}

function InventorySection(props: {
  d: OpsIntelligence;
  asOf: string;
  registerExport: (id: string, get: () => BiPdfSection) => () => void;
}) {
  const inv = () => props.d.inventory;
  const flagLabels = ["Low stock", "Zero stock", "Serial mismatch", "Stale reserved"];
  const flagValues = () => [inv().low_stock, inv().zero_stock, inv().serial_mismatch, inv().reserved_stale];
  return (
    <div class="space-y-3">
      <h2 class="text-sm font-semibold text-text-primary">Inventory</h2>
      <div class="grid gap-4 lg:grid-cols-2">
        <BiReportCard
          id="inv-flags"
          title="Stock exceptions"
          asOf={props.asOf}
          type="doughnut"
          labels={flagLabels}
          values={flagValues()}
          columns={countCols}
          rows={flagLabels.map((label, i) => ({ label, count: flagValues()[i] ?? 0 }))}
          registerExport={props.registerExport}
        />
        <BiReportCard
          id="inv-trend"
          title="Inbound stock qty (all movement types)"
          caption="Same as the dashboard inbound trend — not goods receipts only."
          asOf={props.asOf}
          type="bar"
          labels={(inv().inbound_trend ?? []).map((p) => p.period)}
          values={(inv().inbound_trend ?? []).map((p) => p.value)}
          valueFormat="int"
          columns={trendCols}
          rows={(inv().inbound_trend ?? []).map((p) => ({ period: p.period, value: p.value }))}
          registerExport={props.registerExport}
        />
        <BiReportCard
          id="inv-by-type"
          title="Inbound qty by movement type"
          asOf={props.asOf}
          type="doughnut"
          labels={(inv().inbound_by_type ?? []).map((r) => r.label)}
          values={(inv().inbound_by_type ?? []).map((r) => r.qty ?? r.count)}
          valueFormat="int"
          columns={qtyCols}
          rows={(inv().inbound_by_type ?? []).map((r) => ({ label: r.label, qty: r.qty ?? r.count }))}
          registerExport={props.registerExport}
        />
      </div>
    </div>
  );
}

function SalesSection(props: {
  d: OpsIntelligence;
  asOf: string;
  registerExport: (id: string, get: () => BiPdfSection) => () => void;
}) {
  const s = () => props.d.sales;
  return (
    <div class="space-y-3">
      <h2 class="text-sm font-semibold text-text-primary">Sales</h2>
      <p class="text-xs text-text-secondary">
        MTD {formatPeso(s().mtd)} · YTD {formatPeso(s().ytd)}
      </p>
      <div class="grid gap-4 lg:grid-cols-2">
        <BiReportCard
          id="sales-trend"
          title="Sales (12 months)"
          asOf={props.asOf}
          type="bar"
          labels={(s().trend ?? []).map((p) => p.period)}
          values={(s().trend ?? []).map((p) => p.value)}
          valueFormat="money"
          columns={trendCols}
          rows={(s().trend ?? []).map((p) => ({ period: p.period, value: p.value }))}
          registerExport={props.registerExport}
        />
        <BiReportCard
          id="sales-customers"
          title="Top customers (90d)"
          asOf={props.asOf}
          type="bar"
          horizontal
          labels={(s().top_customers ?? []).map((r) => r.partner_name ?? "")}
          values={(s().top_customers ?? []).map((r) => r.total_amount ?? 0)}
          valueFormat="money"
          columns={amountCols}
          rows={(s().top_customers ?? []).map((r) => ({ label: r.partner_name, amount: r.total_amount }))}
          registerExport={props.registerExport}
          emptyText="No sales in the last 90 days."
        />
        <BiReportCard
          id="sales-items"
          title="Top selling items (90d)"
          asOf={props.asOf}
          type="bar"
          horizontal
          labels={(s().top_items ?? []).map((r) => `${r.item_code} — ${r.item_name}`)}
          values={(s().top_items ?? []).map((r) => r.qty ?? 0)}
          valueFormat="int"
          columns={[
            { key: "label", header: "Item", value: (r) => String(r.label ?? "") },
            { key: "qty", header: "Qty", value: (r) => Number(r.qty ?? 0) },
          ]}
          rows={(s().top_items ?? []).map((r) => ({ label: `${r.item_code} — ${r.item_name}`, qty: r.qty }))}
          registerExport={props.registerExport}
          emptyText="No sales lines in the last 90 days."
        />
      </div>
    </div>
  );
}

function SalesOrderSection(props: {
  block: OpsClassifiedBlock;
  asOf: string;
  registerExport: (id: string, get: () => BiPdfSection) => () => void;
}) {
  const chart = () => reasonChart(props.block);
  return (
    <div class="space-y-3">
      <h2 class="text-sm font-semibold text-text-primary">Sales orders — why pending</h2>
      <p class="text-xs text-text-secondary">
        Open headers: {int(props.block.open_headers)} · Classified (including completed with a fulfillment gap):{" "}
        {int(props.block.classified_headers)}. One primary reason per order.
      </p>
      <BiReportCard
        id="so-reasons"
        title="Sales order primary reason"
        asOf={props.asOf}
        type="doughnut"
        labels={chart().labels}
        values={chart().values}
        columns={countCols}
        rows={chart().exportRows}
        registerExport={props.registerExport}
        emptyText="No open or gapped sales orders."
      >
        <BiDocTable rows={props.block.top ?? []} money={formatPeso} />
      </BiReportCard>
    </div>
  );
}

function PurchaseOrderSection(props: {
  block: OpsClassifiedBlock;
  asOf: string;
  registerExport: (id: string, get: () => BiPdfSection) => () => void;
}) {
  const chart = () => reasonChart(props.block);
  return (
    <div class="space-y-3">
      <h2 class="text-sm font-semibold text-text-primary">Purchase orders — why pending</h2>
      <p class="text-xs text-text-secondary">
        Open headers: {int(props.block.open_headers)} · Classified: {int(props.block.classified_headers)}. POs have no
        promised date — reasons use approval, confirm, receive qty, and unbilled GR only.
      </p>
      <BiReportCard
        id="po-reasons"
        title="Purchase order primary reason"
        asOf={props.asOf}
        type="doughnut"
        labels={chart().labels}
        values={chart().values}
        columns={countCols}
        rows={chart().exportRows}
        registerExport={props.registerExport}
        emptyText="No open or gapped purchase orders."
      >
        <BiDocTable rows={props.block.top ?? []} money={formatPeso} />
      </BiReportCard>
    </div>
  );
}

function PurchasesSection(props: {
  d: OpsIntelligence;
  asOf: string;
  registerExport: (id: string, get: () => BiPdfSection) => () => void;
}) {
  const p = () => props.d.purchases;
  return (
    <div class="space-y-3">
      <h2 class="text-sm font-semibold text-text-primary">Purchases</h2>
      <p class="text-xs text-text-secondary">Supplier invoices MTD {formatPeso(p().mtd)}</p>
      <div class="grid gap-4 lg:grid-cols-2">
        <BiReportCard
          id="purchases-gr"
          title="Posted GR lines billed vs unbilled"
          asOf={props.asOf}
          type="doughnut"
          labels={["Unbilled", "Billed"]}
          values={[p().gr_unbilled_lines, p().gr_billed_lines]}
          columns={countCols}
          rows={[
            { label: "Unbilled", count: p().gr_unbilled_lines },
            { label: "Billed", count: p().gr_billed_lines },
          ]}
          registerExport={props.registerExport}
        />
        <BiReportCard
          id="purchases-vendors"
          title="Top vendors (90d POs)"
          asOf={props.asOf}
          type="bar"
          horizontal
          labels={(p().top_vendors ?? []).map((r) => r.partner_name ?? "")}
          values={(p().top_vendors ?? []).map((r) => r.total_amount ?? 0)}
          valueFormat="money"
          columns={amountCols}
          rows={(p().top_vendors ?? []).map((r) => ({ label: r.partner_name, amount: r.total_amount }))}
          registerExport={props.registerExport}
          emptyText="No purchase orders in the last 90 days."
        />
      </div>
    </div>
  );
}

function FollowUpSection(props: {
  d: OpsIntelligence;
  asOf: string;
  registerExport: (id: string, get: () => BiPdfSection) => () => void;
}) {
  const f = () => props.d.follow_up;
  return (
    <div class="space-y-3">
      <h2 class="text-sm font-semibold text-text-primary">Follow-up</h2>
      <p class="text-xs text-text-secondary">
        Quotes expiring 7d: {int(f().quotes_expiring_7d)} · Expired quotes: {int(f().expired_quotes)} · Pending
        approvals: {int(f().pending_approvals)}
      </p>
      <div class="grid gap-4 lg:grid-cols-2">
        <BiReportCard
          id="follow-stage"
          title="Open follow-up tasks by stage"
          asOf={props.asOf}
          type="doughnut"
          labels={(f().by_stage ?? []).map((r) => r.label)}
          values={(f().by_stage ?? []).map((r) => r.count)}
          columns={countCols}
          rows={(f().by_stage ?? []).map((r) => ({ label: r.label, count: r.count }))}
          registerExport={props.registerExport}
          emptyText="No open follow-up tasks."
        />
        <BiReportCard
          id="follow-type"
          title="Open follow-up tasks by type"
          asOf={props.asOf}
          type="doughnut"
          labels={(f().by_type ?? []).map((r) => r.label)}
          values={(f().by_type ?? []).map((r) => r.count)}
          columns={countCols}
          rows={(f().by_type ?? []).map((r) => ({ label: r.label, count: r.count }))}
          registerExport={props.registerExport}
          emptyText="No open follow-up tasks."
        />
      </div>
      <Show when={(f().top ?? []).length > 0}>
        <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
          <div class="mb-2 flex items-center justify-between gap-2">
            <h3 class="text-sm font-semibold text-text-primary">Next follow-ups</h3>
            <button
              type="button"
              class="rounded-md border border-stroke bg-white px-2 py-1 text-xs font-medium text-text-primary hover:bg-slate-50"
              onClick={() =>
                downloadBiCsv(
                  "follow-up-top.csv",
                  followCols,
                  (f().top ?? []).map((r) => ({ title: r.title, stage: r.stage, due_date: r.due_date })),
                )
              }
            >
              CSV
            </button>
          </div>
          <ul class="space-y-1.5 text-sm">
            <For each={f().top}>
              {(row) => (
                <li class="flex items-center justify-between gap-2">
                  <A href={row.href} class="truncate text-brand-600 hover:underline">
                    {row.title || "(untitled)"}
                  </A>
                  <span class="shrink-0 text-xs text-text-secondary">
                    {row.stage} · {row.due_date}
                  </span>
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>
    </div>
  );
}
