import DocAreaOverviewPage from "../../shared/DocAreaOverviewPage";

export default function ExpenseOverviewPage() {
  return (
    <DocAreaOverviewPage
      config={{
        title: "Expense",
        description: "Record expenses, manage vendors, and pay open AP.",
        actions: [
          {
            eyebrow: "Spend",
            title: "Expenses",
            blurb: "Log one-off and billable expenses.",
            href: "/app/purchases/expenses",
          },
          {
            eyebrow: "Recurring",
            title: "Recurring expenses",
            blurb: "Templates for repeating costs.",
            href: "/app/purchases/recurring-expenses",
          },
          {
            eyebrow: "Pay",
            title: "Accounts payable",
            blurb: "Pay open supplier and expense balances.",
            href: "/app/finance/payables",
          },
        ],
        links: [
          { label: "Vendors", href: "/app/inventory/partners?kind=vendor" },
          { label: "Vendor credits", href: "/app/purchases/vendor-credits" },
          { label: "Purchase overview", href: "/app/purchases" },
        ],
      }}
    />
  );
}
