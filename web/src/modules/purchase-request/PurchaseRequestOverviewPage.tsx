import DocAreaOverviewPage from "../../shared/DocAreaOverviewPage";

export default function PurchaseRequestOverviewPage() {
  return (
    <DocAreaOverviewPage
      config={{
        title: "Purchase Request",
        description: "Internal requisitions before RFQ or purchase order.",
        actions: [
          {
            eyebrow: "Create",
            title: "New purchase request",
            blurb: "Ask to buy — route for approval when required.",
            href: "/app/purchase-request/purchase-requests/new",
          },
          {
            eyebrow: "Work queue",
            title: "P.R. status",
            blurb: "Track open and in-progress requests.",
            href: "/app/purchase-request/purchase-requests/status",
          },
          {
            eyebrow: "Browse",
            title: "Purchase request list",
            blurb: "All purchase requests.",
            href: "/app/purchase-request/purchase-requests",
          },
        ],
        links: [
          { label: "RFQ overview", href: "/app/rfq" },
          { label: "Purchase order overview", href: "/app/purchase-order" },
        ],
      }}
    />
  );
}
