import { A } from "@solidjs/router";
import { For } from "solid-js";
import { acctINavLinks } from "../../../shell/acct-i-nav";

const primaryLinks = [
  { label: "Journal entries", href: "/app/finance/acct-i/journal-entries", blurb: "Record and post general ledger journals." },
  { label: "Chart of accounts", href: "/app/finance/acct-i/chart-of-accounts", blurb: "Maintain account hierarchy and types." },
  { label: "Trial balance", href: "/app/finance/acct-i/reports/trial-balance", blurb: "Debits and credits by account." },
  { label: "General ledger", href: "/app/finance/acct-i/reports/general-ledger", blurb: "Posted journal lines for a period." },
  { label: "Profit & loss", href: "/app/finance/acct-i/reports/profit-and-loss", blurb: "Income and expense for the period." },
  { label: "Balance sheet", href: "/app/finance/acct-i/reports/balance-sheet", blurb: "Assets, liabilities, and equity." },
  { label: "Cash flow", href: "/app/finance/acct-i/reports/cash-flow-statement", blurb: "Operating, investing, and financing cash." },
  { label: "Cash book", href: "/app/finance/acct-i/reports/cash-book", blurb: "Cash and bank account movements." },
  { label: "Bank reconciliation", href: "/app/finance/acct-i/bank-reconciliation", blurb: "Match bank lines to ledger activity." },
  { label: "Fiscal years", href: "/app/finance/acct-i/fiscal-years", blurb: "Open and close accounting periods." },
];

/** Dedicated bookkeeping workspace — GL / journals / statements (separate from Collections). */
export default function BookkeepingHubPage() {
  return (
    <div class="space-y-6 p-4 md:p-6">
      <header>
        <h1 class="text-xl font-semibold text-text-primary">Bookkeeping</h1>
        <p class="mt-1 max-w-3xl text-sm text-text-secondary">
          General ledger, journals, and financial statements. Customer collections stay under{" "}
          <A href="/app/finance/collections" class="font-medium text-brand-600 hover:underline">
            Collections
          </A>
          ; vendor payments under{" "}
          <A href="/app/finance/disbursements" class="font-medium text-brand-600 hover:underline">
            Disbursements
          </A>
          .
        </p>
      </header>

      <section class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <For each={primaryLinks}>
          {(link) => (
            <A
              href={link.href}
              class="rounded-xl border border-stroke bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow-md"
            >
              <p class="font-medium text-text-primary">{link.label}</p>
              <p class="mt-1 text-sm text-text-secondary">{link.blurb}</p>
            </A>
          )}
        </For>
      </section>

      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <h2 class="text-sm font-semibold text-text-primary">All ledger tools</h2>
        <ul class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <For each={acctINavLinks}>
            {(link) => (
              <li>
                <A href={link.href} class="text-sm font-medium text-brand-600 hover:underline">
                  {link.label}
                </A>
              </li>
            )}
          </For>
        </ul>
      </section>
    </div>
  );
}
