import { A } from "@solidjs/router";
import { ArApAsOfReportView } from "../reports/ArApAsOfReportView";

/** Unified payables workspace: open balances + confirm payment via Payment Voucher. */
export default function DisbursementsHubPage() {
  return (
    <div class="space-y-4 p-4 md:p-6">
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold text-text-primary">Payables management</h1>
          <p class="mt-1 text-sm text-text-secondary">
            Track open vendor balances in one place. Create a Payment Voucher to confirm you already paid and clear the balance.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <A
            href="/app/finance/payment-vouchers/new"
            class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Create Payment Voucher
          </A>
          <A
            href="/app/finance/payment-vouchers"
            class="rounded-lg border border-stroke px-4 py-2 text-sm hover:bg-slate-50"
          >
            PV list
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
        subtitle="Vendor balances as of today. After you confirm payment with a Payment Voucher, balances update here."
      />
    </div>
  );
}
