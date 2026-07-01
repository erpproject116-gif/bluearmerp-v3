import { A } from "@solidjs/router";
import { For, Show } from "solid-js";
import { useAuth } from "../../shared/auth-context";
import { useFinanceWorkspace } from "../../shared/reports/useModuleReports";

type KpiTile = {
  label: string;
  value: (s: NonNullable<ReturnType<typeof useFinanceWorkspace>["data"]>) => number;
  href: string;
  accent?: string;
};

const tiles: KpiTile[] = [
  { label: "A/R customers", value: (s) => s.ar_customers, href: "/app/finance/reports/ar-by-customer" },
  { label: "Unpaid supplier invoices", value: (s) => s.unpaid_supplier_invoices, href: "/app/finance/supplier-invoices", accent: "text-red-600" },
  { label: "Draft journal entries", value: (s) => s.draft_journal_entries, href: "/app/finance/journal-entries", accent: "text-amber-600" },
  { label: "Unmatched bank lines", value: (s) => s.unmatched_bank_lines, href: "/app/finance/bank-reconciliation", accent: "text-amber-600" },
  { label: "AP over-applied", value: (s) => s.ap_over_application, href: "/app/finance/payment-vouchers", accent: "text-red-600" },
];

const reportLinks = [
  { label: "A/R by Customer", href: "/app/finance/reports/ar-by-customer" },
  { label: "A/P by Vendor", href: "/app/finance/reports/ap-by-vendor" },
  { label: "A/R Aging", href: "/app/finance/reports/ar-aging" },
  { label: "A/P Aging", href: "/app/finance/reports/ap-aging" },
  { label: "Trial Balance", href: "/app/finance/reports/trial-balance" },
  { label: "General Ledger", href: "/app/finance/reports/general-ledger" },
  { label: "Profit & Loss", href: "/app/finance/reports/profit-and-loss" },
  { label: "Balance Sheet", href: "/app/finance/reports/balance-sheet" },
];

export default function FinanceWorkspacePage() {
  const auth = useAuth();
  const workspace = useFinanceWorkspace();

  return (
    <div class="space-y-6">
      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <h2 class="text-lg font-semibold text-text-primary">Finance workspace</h2>
        <p class="text-sm text-text-secondary">{auth.me?.tenant.company_name}</p>
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

      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <h3 class="mb-4 text-sm font-semibold text-text-primary">Reports</h3>
        <Show when={!workspace.isLoading} fallback={<p class="text-sm text-text-secondary">Loading…</p>}>
          <ul class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <For each={reportLinks}>
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
