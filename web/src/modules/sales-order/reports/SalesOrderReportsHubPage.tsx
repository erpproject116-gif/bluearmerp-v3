import { DeptReportsHub } from "../../../shared/reports/DeptReportsHub";

const links = [
  { label: "SO analysis", href: "/app/sales-order/reports/so-analysis", blurb: "Sales order totals and trends." },
  { label: "Shipment status", href: "/app/sales-order/reports/shipment-status", blurb: "Where deliveries stand." },
  { label: "Pending shipment", href: "/app/sales-order/reports/pending-shipment", blurb: "Orders still waiting to ship." },
  { label: "Shipping order status", href: "/app/sales-order/reports/shipping-order-status", blurb: "Shipping order progress." },
  { label: "Sales order status", href: "/app/sales-order/sales-orders/status", blurb: "Status board for sales orders." },
  { label: "Open orders", href: "/app/sales-order/sales-orders/outstanding", blurb: "Orders not yet closed." },
];

export default function SalesOrderReportsHubPage() {
  return (
    <DeptReportsHub
      title="Sales order reports"
      description="Delivery and order reports for the sales order desk. Open a card, set filters, then run the report."
      links={links}
    />
  );
}
