import { uiLabel } from "../../shared/branding/uiLabel";
import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import { useAuth } from "../../shared/auth-context";
import { useFinanceWorkspace } from "../../shared/reports/useModuleReports";
import { acctINavLinks } from "../../shell/acct-i-nav";
import { acctIINavLinks } from "../../shell/acct-ii-nav";

// #region agent log
fetch("http://127.0.0.1:7860/ingest/4e7a973e-c880-478e-9306-d7b0547d6f55", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a1498a" },
  body: JSON.stringify({
    sessionId: "a1498a",
    runId: "post-fix",
    hypothesisId: "H1",
    location: "FinanceWorkspacePage.tsx:module",
    message: "FinanceWorkspacePage chunk init",
    data: {
      inlineFallback: true,
      uiLabelType: typeof uiLabel,
      showType: typeof Show,
    },
    timestamp: Date.now(),
  }),
}).catch(() => {});
// #endregion

type KpiTile = {
  label: string;
  value: (s: NonNullable<ReturnType<typeof useFinanceWorkspace>["data"]>) => number;
  href: string;
  accent?: string;
};

const tiles: KpiTile[] = [
  { label: "A/R customers", value: (s) => s.ar_customers, href: "/app/finance/reports/ar-by-customer" },
  { label: "Unpaid purchases", value: (s) => s.unpaid_supplier_invoices, href: "/app/purchases/purchases", accent: "text-red-600" },
  { label: "Draft journal entries", value: (s) => s.draft_journal_entries, href: "/app/finance/acct-i/journal-entries", accent: "text-amber-600" },
  { label: "Unmatched bank lines", value: (s) => s.unmatched_bank_lines, href: "/app/finance/acct-i/bank-reconciliation", accent: "text-amber-600" },
  { label: "AP over-applied", value: (s) => s.ap_over_application, href: "/app/finance/payment-vouchers", accent: "text-red-600" },
];

const operationalLinks = [
  { label: "Payment Receipts", href: "/app/finance/official-receipts" },
  { label: "Payment Vouchers", href: "/app/finance/payment-vouchers" },
  { label: "Supplier Invoices", href: "/app/purchases/purchases" },
  { label: "A/R by Customer", href: "/app/finance/reports/ar-by-customer" },
  { label: "Customer/Vendor Book I (AR)", href: "/app/finance/reports/customer-vendor-book-ar" },
  { label: "A/P by Vendor", href: "/app/finance/reports/ap-by-vendor" },
  { label: "Customer/Vendor Book I (AP)", href: "/app/finance/reports/customer-vendor-book-ap" },
  { label: "A/R Aging", href: "/app/finance/reports/ar-aging" },
  { label: "A/P Aging", href: "/app/finance/reports/ap-aging" },
];

export default function FinanceWorkspacePage() {
  const auth = useAuth();
  const workspace = useFinanceWorkspace();

  // #region agent log
  fetch("http://127.0.0.1:7860/ingest/4e7a973e-c880-478e-9306-d7b0547d6f55", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a1498a" },
    body: JSON.stringify({
      sessionId: "a1498a",
      runId: "post-fix",
      hypothesisId: "H3",
      location: "FinanceWorkspacePage.tsx:render",
      message: "FinanceWorkspacePage render",
      data: {
        isLoadingType: typeof workspace.isLoading,
        isLoadingValue: workspace.isLoading,
        isLoadingNegated: !workspace.isLoading,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  return (
    <div class="space-y-6">
      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <h2 class="text-lg font-semibold text-text-primary">Accounting Dept workspace</h2>
        <p class="text-sm text-text-secondary">{auth.me?.tenant.company_name}</p>
        <p class="mt-2 text-sm text-text-secondary">
          BluearmERP accounting: <strong class="font-medium text-text-primary">Acct. I</strong> for core GL and vouchers;{" "}
          <strong class="font-medium text-text-primary">Acct. II</strong> for checks, withholding, budgets, import cost, contracts, and notes.
        </p>
      </section>

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
