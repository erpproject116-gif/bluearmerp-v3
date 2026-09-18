import DocAreaOverviewPage from "../../shared/DocAreaOverviewPage";

export default function PurchaseOrderOverviewPage() {
  return (
    <DocAreaOverviewPage
      config={{
        title: "Purchase Order",
        description: "Order from vendors and track open lines to receive.",
        actions: [
          {
            eyebrow: "Create",
            title: "New purchase order",
            blurb: "Raise a PO from a request, RFQ, or blank.",
            href: "/app/purchase-order/purchase-orders?new=1",
          },
          {
            eyebrow: "Work queue",
            title: "Outstanding POs",
            blurb: "Open purchase orders still to receive or close.",
            href: "/app/purchase-order/purchase-orders?view=outstanding",
          },
          {
            eyebrow: "Browse",
            title: "Purchase order list",
            blurb: "All purchase orders.",
            href: "/app/purchase-order/purchase-orders",
          },
        ],
        links: [
          { label: "PO status", href: "/app/purchase-order/purchase-orders?view=status" },
          { label: "Items to receive", href: "/app/purchase-order/reports/items-to-receive" },
          { label: "New Purchase", href: "/app/purchases/purchase-receive/new" },
        ],
      }}
    />
  );
}
