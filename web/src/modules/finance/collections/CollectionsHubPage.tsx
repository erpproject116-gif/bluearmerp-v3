import { A } from "@solidjs/router";
import { ArApAsOfReportView } from "../reports/ArApAsOfReportView";

/** Unified receivables workspace: open balances + confirm payment via Official Receipt. */
export default function CollectionsHubPage() {
  return (
    <div class="space-y-4 p-4 md:p-6">
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold text-text-primary">Receivables management</h1>
          <p class="mt-1 text-sm text-text-secondary">
            Track open customer balances in one place. Record an Official Receipt to confirm payment and reduce the balance.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <A
            href="/app/finance/receivables"
            class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            New Receivable Payment
          </A>
          <A
            href="/app/finance/official-receipts/new"
            class="rounded-lg border border-stroke px-4 py-2 text-sm hover:bg-slate-50"
          >
            Record Official Receipt
          </A>
          <A
            href="/app/finance/official-receipts"
            class="rounded-lg border border-stroke px-4 py-2 text-sm hover:bg-slate-50"
          >
            OR list
          </A>
          <A
            href="/app/finance/reports/ar-aging-details"
            class="rounded-lg border border-stroke px-4 py-2 text-sm hover:bg-slate-50"
          >
            A/R aging
          </A>
          <A
            href="/app/finance/reports/customer-vendor-book-ar"
            class="rounded-lg border border-stroke px-4 py-2 text-sm hover:bg-slate-50"
          >
            Customer book
          </A>
        </div>
      </header>
      <ArApAsOfReportView
        mode="receivable"
        title="Open receivables"
        subtitle="Customer balances as of today. After you confirm payment with an Official Receipt, balances update here."
      />
    </div>
  );
}
