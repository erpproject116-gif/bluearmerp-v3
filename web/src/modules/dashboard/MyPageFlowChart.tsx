import { A } from "@solidjs/router";
import { For, Show } from "solid-js";

type FlowNode = { label: string; href: string };

type FlowRow = {
  title: string;
  nodes: FlowNode[];
};

const MASTERS: FlowNode[] = [
  { label: "Customer / Vendor", href: "/app/inventory/partners" },
  { label: "Item", href: "/app/inventory/items" },
  { label: "Location", href: "/app/inventory/locations" },
  { label: "Tax", href: "/app/quotation/tax-mngt/tax-types" },
  { label: "Setup", href: "/app/user-management" },
];

const FLOWS: FlowRow[] = [
  {
    title: "Sales",
    nodes: [
      { label: "Quotation", href: "/app/quotation/quotations" },
      { label: "Sales Order", href: "/app/sales-order/sales-orders" },
      { label: "Sales", href: "/app/sales/sales" },
      { label: "Receipt", href: "/app/finance/official-receipts" },
    ],
  },
  {
    title: "Purchasing",
    nodes: [
      { label: "Purchase Request", href: "/app/purchase-request/purchase-requests" },
      { label: "PO", href: "/app/purchase-order/purchase-orders" },
      { label: "Goods Receipt", href: "/app/purchase-order/goods-receipt" },
      { label: "Purchase", href: "/app/purchases/purchases" },
      { label: "Pay", href: "/app/finance/payment-vouchers" },
    ],
  },
];

function NodePill(props: { node: FlowNode; accent?: boolean }) {
  return (
    <A
      href={props.node.href}
      class="inline-flex min-w-[5.5rem] flex-col items-center rounded-full border px-3 py-1.5 text-center text-xs font-medium transition hover:shadow-sm"
      classList={{
        "border-red-200 bg-red-50 text-red-800": props.accent,
        "border-stroke bg-white text-text-primary hover:border-brand-200 hover:bg-brand-50": !props.accent,
      }}
    >
      {props.node.label}
    </A>
  );
}

export function MyPageFlowChart() {
  return (
    <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
      <h2 class="mb-1 text-sm font-semibold text-text-primary">Flow Chart</h2>
      <p class="mb-4 text-xs text-text-secondary">
        Click a step to open the right screen — follow the chain left to right (Ecount-style).
      </p>

      <div class="mb-5 flex flex-wrap gap-2">
        <For each={MASTERS}>{(n) => <NodePill node={n} />}</For>
      </div>

      <For each={FLOWS}>
        {(row) => (
          <div class="mb-4 last:mb-0">
            <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">{row.title}</p>
            <div class="flex flex-wrap items-center gap-1.5">
              <For each={row.nodes}>
                {(node, i) => (
                  <>
                    <Show when={i() > 0}>
                      <span class="text-text-secondary/60" aria-hidden="true">
                        →
                      </span>
                    </Show>
                    <NodePill node={node} accent={node.label === "Receipt" || node.label === "Pay"} />
                  </>
                )}
              </For>
            </div>
          </div>
        )}
      </For>
    </section>
  );
}
