import { uiLabel } from "../../shared/branding/uiLabel";
import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import { useAuth } from "../../shared/auth-context";
import { isTenantFeatureEnabled } from "../../shared/moduleAccess";
import { useFinanceWorkspace } from "../../shared/reports/useModuleReports";
import { acctINavLinks } from "../../shell/acct-i-nav";
import { acctIINavLinks } from "../../shell/acct-ii-nav";

type KpiTile = {
  label: string;
  value: (s: NonNullable<ReturnType<typeof useFinanceWorkspace>["data"]>) => number;
  href: string;
  accent?: string;
};

const tiles: KpiTile[] = [
  { label: "A/R customers", value: (s) => s.ar_customers, href: "/app/finance/reports/ar-by-customer" },
  { label: "Unpaid purchases", value: (s) => s.unpaid_supplier_invoices, href: "/app/purchases/purchase-receive", accent: "text-red-600" },
  { label: "Draft journal entries", value: (s) => s.draft_journal_entries, href: "/app/finance/acct-i/journal-entries", accent: "text-amber-600" },
  { label: "Unmatched bank lines", value: (s) => s.unmatched_bank_lines, href: "/app/finance/acct-i/bank-reconciliation", accent: "text-amber-600" },
  { label: "AP over-applied", value: (s) => s.ap_over_application, href: "/app/finance/payment-vouchers", accent: "text-red-600" },
];

const operationalLinks = [
  { label: "New Receivable Payment", href: "/app/finance/receivables" },
  { label: "New Payable Payment", href: "/app/finance/payables" },
  { label: "Official Receipts", href: "/app/finance/official-receipts" },
  { label: "Payment Vouchers", href: "/app/finance/payment-vouchers" },
  { label: "Receivables hub", href: "/app/finance/collections" },
  { label: "Payables hub", href: "/app/finance/disbursements" },
  { label: "Supplier Invoices", href: "/app/purchases/purchase-receive" },
  { label: "A/R by Customer", href: "/app/finance/reports/ar-by-customer" },
  { label: "A/P by Vendor", href: "/app/finance/reports/ap-by-vendor" },
  { label: "A/R Aging", href: "/app/finance/reports/ar-aging" },
  { label: "A/P Aging", href: "/app/finance/reports/ap-aging" },
];

export default function FinanceWorkspacePage() {
  const auth = useAuth();
  const workspace = useFinanceWorkspace();
  const showAcctI = () => isTenantFeatureEnabled(auth.me, "finance.acct_i", "finance");
  const showAcctII = () => isTenantFeatureEnabled(auth.me, "finance.acct_ii", "finance");

  return (
    <div class="space-y-6">
      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <p class="text-sm text-text-secondary">{auth.me?.tenant.company_name}</p>
        <p class="mt-2 text-sm text-text-secondary">
          Collect and pay from open balances under{" "}
          <strong class="font-medium text-text-primary">Accounting</strong>: use{" "}
          <strong class="font-medium text-text-primary">New Receivable Payment</strong> and{" "}
          <strong class="font-medium text-text-primary">New Payable Payment</strong>. Bookkeeping covers GL and
          journals; Banking covers cash accounts.
        </p>
      </section>

      <Show when={showAcctII()}>
        <section class="grid gap-4 sm:grid-cols-2">
          <A
            href="/app/finance/receivables"
            class="rounded-xl border border-brand-200 bg-brand-50/70 p-5 shadow-sm transition hover:border-brand-400 hover:shadow-md"
          >
            <p class="text-xs font-semibold uppercase tracking-wide text-brand-700">Collect from customers</p>
            <h2 class="mt-1 text-lg font-semibold text-text-primary">New Receivable Payment</h2>
            <p class="mt-2 text-sm text-text-secondary">
              Open A/R balances → enter Decrease Amount → apply as Official Receipt.
            </p>
          </A>
          <A
            href="/app/finance/payables"
            class="rounded-xl border border-brand-200 bg-brand-50/70 p-5 shadow-sm transition hover:border-brand-400 hover:shadow-md"
          >
            <p class="text-xs font-semibold uppercase tracking-wide text-brand-700">Pay vendors</p>
            <h2 class="mt-1 text-lg font-semibold text-text-primary">New Payable Payment</h2>
            <p class="mt-2 text-sm text-text-secondary">
              Open A/P balances → enter Decrease Amount → apply as Payment Voucher.
            </p>
          </A>
        </section>
      </Show>

      <section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <For each={tiles}>
          {(tile) => (
            <A
              href={tile.href}
              class="rounded-xl border border-stroke bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow-md"
            >
              <p class="text-sm text-text-secondary">{tile.label}</p>
              <p class={`mt-2 text-3xl font-bold ${tile.accent ?? "text-text-primary"}`}>
                {workspace.isLoading ? "…" : (workspace.data ? tile.value(workspace.data) : 0)}
              </p>
            </A>
          )}
        </For>
      </section>

      <div class="grid gap-6 lg:grid-cols-2">
        <Show when={showAcctI()}>
          <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
            <h3 class="mb-1 text-sm font-semibold text-text-primary">Acct. I — Core accounting</h3>
            <p class="mb-4 text-xs text-text-secondary">Journal, chart of accounts, bank recon, financial statements</p>
            <ul class="grid gap-2 sm:grid-cols-2">
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
        </Show>

        <Show when={showAcctII()}>
          <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
            <h3 class="mb-1 text-sm font-semibold text-text-primary">Acct. II — Extended accounting</h3>
            <p class="mb-4 text-xs text-text-secondary">Receivable/payable depth, checks, budget, withholding, import, contracts</p>
            <ul class="grid gap-2 sm:grid-cols-2">
              <For each={acctIINavLinks}>
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
        </Show>
      </div>

      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <h3 class="mb-4 text-sm font-semibold text-text-primary">AR / AP operations</h3>
        <Show when={!workspace.isLoading} fallback={<p class="text-sm text-text-secondary">{uiLabel("common.loading")}</p>}>
          <ul class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <For each={operationalLinks}>
              {(link) => (
                <li>
                  <A href={link.href} class="text-sm font-medium text-brand-600 hover:underline">
                    {link.label}
                  </A>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </section>
    </div>
  );
}
