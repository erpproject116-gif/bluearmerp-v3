import DocAreaOverviewPage from "../../shared/DocAreaOverviewPage";

export default function RfqOverviewPage() {
  return (
    <DocAreaOverviewPage
      config={{
        title: "RFQ",
        description: "Request quotes from vendors before raising a purchase order.",
        actions: [
          {
            eyebrow: "Create",
            title: "New RFQ",
            blurb: "Start a request for quotation and add lines.",
            href: "/app/purchase-order/rfq?new=1",
          },
          {
            eyebrow: "Browse",
            title: "RFQ list",
            blurb: "Open RFQs and collected supplier quotes.",
            href: "/app/purchase-order/rfq",
          },
          {
            eyebrow: "Next step",
            title: "Purchase orders",
            blurb: "Turn awarded quotes into POs.",
            href: "/app/purchase-order/purchase-orders",
          },
        ],
        links: [
          { label: "Purchase request", href: "/app/purchase-request" },
          { label: "Purchase overview", href: "/app/purchases" },
        ],
      }}
    />
  );
}
