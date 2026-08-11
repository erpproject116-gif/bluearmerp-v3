import { A } from "@solidjs/router";
import { ArApAsOfReportView } from "../reports/ArApAsOfReportView";

/** Payment Made workspace: open A/P + confirm payment via Payment Voucher. */
export default function DisbursementsHubPage() {
  return (
    <div class="space-y-4 p-4 md:p-6">
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold text-text-primary">Payment Made</h1>
          <p class="mt-1 text-sm text-text-secondary">
            Last step of buy: PO → Purchase Receive → Bill → <span class="font-medium">Payment Made</span>. Track
            open vendor balances and create a Payment Voucher when you pay.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <A
            href="/app/finance/payables"
            class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            New Payable Payment
          </A>
          <A
            href="/app/finance/payment-vouchers/new"
            class="rounded-lg border border-stroke px-4 py-2 text-sm hover:bg-slate-50"
          >
            New Payment Made
          </A>
          <A
            href="/app/finance/payment-vouchers"
            class="rounded-lg border border-stroke px-4 py-2 text-sm hover:bg-slate-50"
          >
            Payment list
          </A>
          <A
            href="/app/purchases/purchase-receive"
            class="rounded-lg border border-stroke px-4 py-2 text-sm hover:bg-slate-50"
          >
            Bills
          </A>
          <A
            href="/app/finance/reports/ap-aging-details"
            class="rounded-lg border border-stroke px-4 py-2 text-sm hover:bg-slate-50"
          >
            A/P aging
          </A>
          <A
            href="/app/finance/reports/customer-vendor-book-ap"
            class="rounded-lg border border-stroke px-4 py-2 text-sm hover:bg-slate-50"
          >
            Vendor book
          </A>
        </div>
      </header>
      <ArApAsOfReportView
        mode="payable"
        title="Open payables"
        subtitle="Vendor balances as of today. After Payment Made (Payment Voucher), balances update here."
      />
    </div>
  );
}
