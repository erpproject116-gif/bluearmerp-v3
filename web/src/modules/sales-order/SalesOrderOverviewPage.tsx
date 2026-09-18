import DocAreaOverviewPage from "../../shared/DocAreaOverviewPage";

export default function SalesOrderOverviewPage() {
  return (
    <DocAreaOverviewPage
      config={{
        title: "Sales Order",
        description: "Confirm demand, reserve stock, and track fulfillment before billing.",
        actions: [
          {
            eyebrow: "Create",
            title: "New sales order",
            blurb: "Commit a customer order and plan delivery.",
            href: "/app/sales-order/sales-orders/new",
          },
          {
            eyebrow: "Work queue",
            title: "Outstanding sales orders",
            blurb: "Open orders not yet closed.",
            href: "/app/sales-order/sales-orders?view=outstanding",
          },
          {
            eyebrow: "Browse",
            title: "Sales order list",
            blurb: "All sales orders in list view.",
            href: "/app/sales-order/sales-orders",
          },
        ],
        links: [
          { label: "Sales order status", href: "/app/sales-order/sales-orders?view=status" },
          { label: "SO analysis", href: "/app/sales-order/reports/so-analysis" },
          { label: "New Sales", href: "/app/sales/sales/new" },
        ],
      }}
    />
  );
}
