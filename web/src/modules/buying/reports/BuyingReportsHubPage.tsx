import { DeptReportsHub } from "../../../shared/reports/DeptReportsHub";

const links = [
  { label: "Purchase status", href: "/app/buying/reports/purchase-status", blurb: "Where each purchase sits in the process." },
  { label: "Payable status", href: "/app/buying/reports/payable-status", blurb: "What we still owe suppliers." },
  { label: "Pre-invoicing", href: "/app/buying/reports/pre-invoicing", blurb: "Receipts ready to bill." },
  { label: "PO analysis", href: "/app/purchase-order/reports/po-analysis", blurb: "Purchase order totals and trends." },
  { label: "PO status", href: "/app/purchase-order/purchase-orders/status", blurb: "Open and closed purchase orders." },
  { label: "Items to receive", href: "/app/purchase-order/reports/items-to-receive", blurb: "What is still outstanding to receive." },
  { label: "A/P by vendor", href: "/app/purchases/purchases/ap-by-vendor", blurb: "Balances owed per supplier." },
  { label: "Payment status", href: "/app/purchases/purchases/payment-status", blurb: "Supplier payment progress." },
  { label: "Purchase invoice status", href: "/app/purchases/purchases/status", blurb: "Invoice list status view." },
];

export default function BuyingReportsHubPage() {
  return (
    <DeptReportsHub
      title="Purchasing reports"
      description="Pick a report to see purchasing, receiving, and payables status. Use filters on each page, then run the report."
      links={links}
    />
  );
}
