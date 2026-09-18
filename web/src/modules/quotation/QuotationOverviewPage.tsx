import DocAreaOverviewPage from "../../shared/DocAreaOverviewPage";

export default function QuotationOverviewPage() {
  return (
    <DocAreaOverviewPage
      config={{
        title: "Quotation",
        description: "Price and send quotes — then convert open quotes into sales orders.",
        actions: [
          {
            eyebrow: "Create",
            title: "New quotation",
            blurb: "Build a priced quote for a customer.",
            href: "/app/quotation/quotations/new",
          },
          {
            eyebrow: "Work queue",
            title: "Outstanding quotations",
            blurb: "Open quotes still awaiting convert or close.",
            href: "/app/quotation/quotations?view=outstanding",
          },
          {
            eyebrow: "Browse",
            title: "Quotation list",
            blurb: "All quotations in list view.",
            href: "/app/quotation/quotations",
          },
        ],
        links: [
          { label: "Quotation status", href: "/app/quotation/quotations?view=status" },
          { label: "New sales order", href: "/app/sales-order/sales-orders/new" },
          { label: "Sales overview", href: "/app/sales" },
        ],
      }}
    />
  );
}
