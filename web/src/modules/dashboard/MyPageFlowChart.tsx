import { A } from "@solidjs/router";
import { For, Show } from "solid-js";

type FlowNode = {
  label: string;
  href: string;
  /** Short second line under the label */
  sub?: string;
  /** Cash / settlement step */
  accent?: boolean;
  /** Shown as optional / skippable */
  optional?: boolean;
};

type FlowRow = {
  title: string;
  blurb: string;
  nodes: FlowNode[];
};

const MASTERS: FlowNode[] = [
  { label: "Partners", href: "/app/inventory/partners", sub: "Customer / vendor" },
  { label: "Items", href: "/app/inventory/items", sub: "Track qty on" },
  { label: "Locations", href: "/app/inventory/locations", sub: "Warehouse" },
  { label: "Tax", href: "/app/quotation/tax-mngt/tax-types", sub: "VAT types" },
  { label: "Accounting setup", href: "/app/finance/setup", sub: "Auto-post & CoA" },
];

const FLOWS: FlowRow[] = [
  {
    title: "Sell (simple)",
    blurb: "Day-to-day: open New Sales, save, then collect payment. Quotation and Sales Order are optional.",
    nodes: [
      { label: "Quotation", href: "/app/quotation/quotations", sub: "Optional", optional: true },
      { label: "Sales Order", href: "/app/sales-order/sales-orders", sub: "Optional", optional: true },
      { label: "New Sales", href: "/app/sales/sales", sub: "Invoice + stock out" },
      { label: "Get paid", href: "/app/finance/official-receipts", sub: "Official Receipt", accent: true },
    ],
  },
  {
    title: "Buy (simple)",
    blurb: "Happy path: Purchase Order → New Purchase (stock in on save). Use Receiving only for serials/lots or GR-before-invoice.",
    nodes: [
      { label: "Purchase Request", href: "/app/purchase-request/purchase-requests", sub: "Optional", optional: true },
      { label: "Purchase Order", href: "/app/purchase-order/purchase-orders", sub: "Commit to vendor" },
      { label: "Receiving", href: "/app/purchase-order/goods-receipt", sub: "Advanced", optional: true },
      { label: "New Purchase", href: "/app/purchases/purchases", sub: "Bill + stock in" },
      { label: "Pay vendor", href: "/app/finance/payment-vouchers", sub: "Payment Voucher", accent: true },
    ],
  },
];

function NodePill(props: { node: FlowNode }) {
  const n = () => props.node;
  return (
    <A
      href={n().href}
      class="inline-flex min-w-[6.25rem] max-w-[9rem] flex-col items-center rounded-xl border px-2.5 py-1.5 text-center transition hover:shadow-sm"
      classList={{
        "border-emerald-300 bg-emerald-50 text-emerald-900": n().accent,
        "border-dashed border-stroke/80 bg-slate-50/80 text-text-secondary": !!n().optional && !n().accent,
        "border-stroke bg-white text-text-primary hover:border-brand-200 hover:bg-brand-50": !n().accent && !n().optional,
      }}
    >
      <span class="text-xs font-semibold leading-tight">{n().label}</span>
      <Show when={n().sub}>
        <span class="mt-0.5 text-[10px] font-normal leading-tight opacity-80">{n().sub}</span>
      </Show>
    </A>
  );
}

export function MyPageFlowChart() {
  return (
    <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
      <h2 class="mb-1 text-sm font-semibold text-text-primary">How work flows</h2>
      <p class="mb-4 text-xs text-text-secondary">
        Click a step to open that screen. Solid pills are the usual path; dashed pills are optional. Accounting
        (journals, stock GL) runs in the background when Chart of Accounts defaults and auto-post are set — you do
        not add extra steps on New Sales or New Purchase.
      </p>

      <p class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Start here (masters)</p>
      <div class="mb-5 flex flex-wrap gap-2">
        <For each={MASTERS}>{(n) => <NodePill node={n} />}</For>
      </div>

      <For each={FLOWS}>
        {(row) => (
          <div class="mb-5 last:mb-0">
            <p class="mb-0.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">{row.title}</p>
            <p class="mb-2 text-[11px] leading-snug text-text-secondary">{row.blurb}</p>
            <div class="flex flex-wrap items-center gap-1.5">
              <For each={row.nodes}>
                {(node, i) => (
                  <>
                    <Show when={i() > 0}>
                      <span class="px-0.5 text-text-secondary/50" aria-hidden="true">
                        →
                      </span>
                    </Show>
                    <NodePill node={node} />
                  </>
                )}
              </For>
            </div>
          </div>
        )}
      </For>

      <div class="mt-1 rounded-lg border border-dashed border-stroke bg-slate-50/90 px-3 py-2.5">
        <p class="text-xs font-semibold text-text-primary">Load Slip (inside the form)</p>
        <p class="mt-1 text-[11px] leading-snug text-text-secondary">
          Load Slip is not its own menu page — it is a button on New Sales / New Purchase / PO that pulls open lines
          from an earlier document (e.g. Sales ← Sales Order, Purchase ← PO or Receiving). Use it when you already
          have an upstream doc; skip it for a walk-in sale or a simple bill.
        </p>
      </div>
    </section>
  );
}
