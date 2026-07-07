import { A } from "@solidjs/router";
import { FinanceLayout } from "../FinanceLayout";

export default function AcctInventoryReconciliationPage() {
  return (
    <FinanceLayout>
      <section class="rounded-xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
        <h2 class="text-lg font-semibold text-text-primary">Accounting vs Inventory Reconciliation</h2>
        <p class="mt-2 text-sm text-text-secondary">
          Full ECount-style Acct vs Inventory reconciliation (inventory asset GL vs stock valuation) is not yet implemented.
          Use these existing tools for partial coverage:
        </p>
        <ul class="mt-4 list-disc space-y-2 pl-5 text-sm text-text-secondary">
          <li>
            <A href="/app/inventory/stock-reconciliation" class="font-medium text-brand-600 hover:underline">
              Stock Reconciliation
            </A>
            {" "}— serial, SO fulfillment, GR, and AP mismatch categories.
          </li>
          <li>
            <A href="/app/inventory/reports/on-hand" class="font-medium text-brand-600 hover:underline">
              Inventory Balance (On Hand)
            </A>
            {" "}— operational on-hand qty by item and location.
          </li>
          <li>
            <A href="/app/finance/reports/trial-balance" class="font-medium text-brand-600 hover:underline">
              Trial Balance
            </A>
            {" "}— posted GL inventory asset accounts (manual compare).
          </li>
        </ul>
        <p class="mt-4 text-xs text-text-secondary">
          Gap documented: ECount Acct vs Inventory report requires inventory valuation by GL account and movement tie-out — planned for a future phase.
        </p>
      </section>
    </FinanceLayout>
  );
}
