import { DeptReportsHub } from "../../../shared/reports/DeptReportsHub";

const links = [
  { label: "A/R aging", href: "/app/finance/reports/ar-aging", blurb: "How long customers have owed us." },
  { label: "A/P aging", href: "/app/finance/reports/ap-aging", blurb: "How long we have owed suppliers." },
  { label: "A/R by customer (Accounting)", href: "/app/sales/reports/ar-by-customer", blurb: "Customer balances — accounting view." },
  { label: "Official receipt status (Accounting)", href: "/app/sales/reports/official-receipt-status", blurb: "OR posting status." },
  { label: "SI receipt status (Accounting)", href: "/app/sales/reports/si-receipt-status", blurb: "Sales invoice receipt linkage." },
  { label: "Customer credit balance (Accounting)", href: "/app/sales/reports/customer-credit-balance", blurb: "Unused customer credits." },
  { label: "Receipt status", href: "/app/finance/reports/receipt-status", blurb: "Official receipts status list." },
  { label: "A/P by vendor", href: "/app/finance/reports/ap-by-vendor", blurb: "Supplier payable balances." },
  { label: "Supplier payment status", href: "/app/finance/reports/supplier-payment-status", blurb: "Payments made to suppliers." },
  { label: "Budget vs actual", href: "/app/finance/reports/budget-vs-actual", blurb: "Compare budgets to posted amounts." },
  { label: "Trial balance", href: "/app/finance/acct-i/reports/trial-balance", blurb: "Account balances for the period." },
  { label: "Financial Insights", href: "/app/finance/acct-i/financial-insights", blurb: "Owner KPIs, comparison, trends from posted books." },
  { label: "Profit and loss", href: "/app/finance/acct-i/reports/profit-and-loss", blurb: "Income and expenses." },
  { label: "Balance sheet", href: "/app/finance/acct-i/reports/balance-sheet", blurb: "Assets, liabilities, and equity." },
  { label: "General ledger", href: "/app/finance/acct-i/reports/general-ledger", blurb: "Detailed ledger movements." },
];

export default function FinanceReportsHubPage() {
  return (
    <DeptReportsHub
      title="Accounting reports"
      description="Receivables, payables, and financial statements. Accounting labels are shown for sales-hosted AR reports so you stay oriented."
      links={links}
    />
  );
}
