import { A } from "@solidjs/router";
import { For, Show, createMemo, createSignal } from "solid-js";
import { useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../../shared/api";
import { useToast } from "../../../shared/toast";
import { useBooksHealth, type BooksHealthException } from "../../../shared/reports/useModuleReports";
import { acctINavLinks } from "../../../shell/acct-i-nav";

type ChecklistItem = {
  id: string;
  section: string;
  label: string;
  href: string;
  status: (h: NonNullable<ReturnType<typeof useBooksHealth>["data"]>) => "pass" | "open" | "na";
  detail?: (h: NonNullable<ReturnType<typeof useBooksHealth>["data"]>) => string;
};

const checklist: ChecklistItem[] = [
  {
    id: "sales-pre",
    section: "Week before",
    label: "Pre-invoicing (sales)",
    href: "/app/sales/sales/pre-invoicing",
    status: (h) => (h.sales_unbilled_lines > 0 ? "open" : "pass"),
    detail: (h) => `${h.sales_unbilled_lines} unbilled sales`,
  },
  {
    id: "purchase-pre",
    section: "Week before",
    label: "Pre-invoicing (purchases)",
    href: "/app/buying/reports/pre-invoicing",
    status: (h) => (h.purchase_unbilled_gr_lines > 0 ? "open" : "pass"),
    detail: (h) => `${h.purchase_unbilled_gr_lines} GR lines waiting to bill`,
  },
  {
    id: "draft-je",
    section: "GL & posting",
    label: "Draft journal entries reviewed/posted",
    href: "/app/finance/acct-i/journal-entries",
    status: (h) => (h.draft_journal_entries > 0 ? "open" : "pass"),
    detail: (h) => `${h.draft_journal_entries} drafts`,
  },
  {
    id: "audit-only",
    section: "GL & posting",
    label: "OR/PV on Trial Balance (not audit-only)",
    href: "/app/finance/official-receipts",
    status: (h) => (h.audit_only_pending > 0 ? "open" : "pass"),
    detail: (h) => `${h.audit_only_pending} audit-only docs`,
  },
  {
    id: "credits-je",
    section: "GL & posting",
    label: "Credit notes / vendor credits have journals",
    href: "/app/sales/credit-notes",
    status: (h) => (h.credits_missing_je > 0 ? "open" : "pass"),
    detail: (h) => `${h.credits_missing_je} missing JE`,
  },
  {
    id: "bank-recon",
    section: "GL & reconciliation",
    label: "Bank reconciliation unmatched lines",
    href: "/app/finance/acct-i/bank-reconciliation",
    status: (h) => (h.unmatched_bank_lines > 0 ? "open" : "pass"),
    detail: (h) => `${h.unmatched_bank_lines} unmatched`,
  },
  {
    id: "inv-recon",
    section: "GL & reconciliation",
    label: "Acct vs inventory (hybrid)",
    href: "/app/finance/reports/acct-inventory-reconciliation",
    status: (h) => {
      if (!h.policies.inventory_gl_hybrid_enabled) return "na";
      if (h.hybrid_inventory_unmapped) return "open";
      return Math.abs(h.inventory_closing_difference) > 0.01 ? "open" : "pass";
    },
    detail: (h) =>
      h.hybrid_inventory_unmapped
        ? "Map Inventory/GRNI/COGS defaults"
        : `Difference ₱${h.inventory_closing_difference.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`,
  },
  {
    id: "tb",
    section: "Sign-off",
    label: "Trial Balance review",
    href: "/app/finance/acct-i/reports/trial-balance",
    status: () => "na",
  },
  {
    id: "pnl",
    section: "Sign-off",
    label: "Profit & Loss review",
    href: "/app/finance/acct-i/reports/profit-and-loss",
    status: () => "na",
  },
  {
    id: "bs",
    section: "Sign-off",
    label: "Balance Sheet review",
    href: "/app/finance/acct-i/reports/balance-sheet",
    status: () => "na",
  },
];

function statusBadge(status: "pass" | "open" | "na") {
  if (status === "pass") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (status === "open") return "bg-amber-50 text-amber-900 border-amber-200";
  return "bg-slate-50 text-text-secondary border-stroke";
}

function statusLabel(status: "pass" | "open" | "na") {
  if (status === "pass") return "Pass";
  if (status === "open") return "Open";
  return "Review";
}

export default function BookkeepingHubPage() {
  const toast = useToast();
  const client = useQueryClient();
  const [asOf, setAsOf] = createSignal(new Date().toISOString().slice(0, 10));
  const [closing, setClosing] = createSignal(false);
  const [backfilling, setBackfilling] = createSignal(false);
  const health = useBooksHealth(() => asOf());

  const sections = createMemo(() => {
    const map = new Map<string, ChecklistItem[]>();
    for (const item of checklist) {
      const list = map.get(item.section) ?? [];
      list.push(item);
      map.set(item.section, list);
    }
    return [...map.entries()];
  });

  const blockReasons = createMemo(() =>
    (health.data?.exceptions ?? []).filter((e) => e.severity === "block").map((e) => e.label),
  );

  const closePeriod = async () => {
    const h = health.data;
    if (!h?.fiscal.period_id) {
      toast.warning("No fiscal period found for this as-of date. Generate periods under Fiscal years.");
      return;
    }
    if (!h.ready_to_close) {
      toast.warning(blockReasons()[0] ?? "Resolve blocking exceptions before closing.");
      return;
    }
    setClosing(true);
    const res = await apiFetch(`/api/v1/finance/fiscal-periods/${h.fiscal.period_id}/close`, { method: "POST" });
    setClosing(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to close period.");
      return;
    }
    toast.success("Fiscal period closed.");
    void client.invalidateQueries({ queryKey: ["finance-books-health"] });
  };

  const backfillCredits = async () => {
    setBackfilling(true);
    const cn = await apiFetch<{ posted: number }>("/api/v1/finance/credit-notes/backfill-journals", { method: "POST" });
    const vc = await apiFetch<{ posted: number }>("/api/v1/finance/vendor-credits/backfill-journals", { method: "POST" });
    setBackfilling(false);
    const posted = (cn.success ? (cn.data?.posted ?? 0) : 0) + (vc.success ? (vc.data?.posted ?? 0) : 0);
    if (!cn.success && !vc.success) {
      toast.warning(cn.message ?? vc.message ?? "Backfill failed.");
      return;
    }
    toast.success(`Posted ${posted} missing credit journals.`);
    void client.invalidateQueries({ queryKey: ["finance-books-health"] });
  };

  return (
    <div class="space-y-6 p-4 md:p-6">
      <header class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-xl font-semibold text-text-primary">Bookkeeping — Books Health</h1>
          <p class="mt-1 max-w-3xl text-sm text-text-secondary">
            Exception queue and month-close checklist driven by live books data. Collections stay under{" "}
            <A href="/app/finance/collections" class="font-medium text-brand-600 hover:underline">
              Collections
            </A>
            ; vendor payments under{" "}
            <A href="/app/finance/disbursements" class="font-medium text-brand-600 hover:underline">
              Disbursements
            </A>
            .
          </p>
        </div>
        <label class="text-sm text-text-secondary">
          As of
          <input
            type="date"
            class="ml-2 rounded-lg border border-stroke px-3 py-2 text-sm text-text-primary"
            value={asOf()}
            onInput={(e) => setAsOf(e.currentTarget.value)}
          />
        </label>
      </header>

      <Show when={!health.isLoading && health.data} fallback={<p class="text-sm text-text-secondary">Loading books health…</p>}>
        {(h) => (
          <>
            <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p class="text-xs font-semibold uppercase tracking-wide text-text-secondary">Fiscal period</p>
                  <p class="mt-1 text-lg font-semibold text-text-primary">
                    {h().fiscal.period_code || "No period"}{" "}
                    <Show when={h().fiscal.year_code}>
                      <span class="text-sm font-normal text-text-secondary">({h().fiscal.year_code})</span>
                    </Show>
                  </p>
                  <p class={`mt-1 text-sm font-medium ${h().fiscal.is_closed ? "text-slate-600" : h().ready_to_close ? "text-emerald-700" : "text-amber-700"}`}>
                    {h().fiscal.is_closed ? "Closed" : h().ready_to_close ? "Ready to close" : "Not ready to close"}
                  </p>
                </div>
                <div class="flex flex-wrap gap-2">
                  <Show when={h().credits_missing_je > 0}>
                    <button
                      type="button"
                      class="rounded-lg border border-brand-600 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
                      disabled={backfilling()}
                      onClick={() => void backfillCredits()}
                    >
                      {backfilling() ? "Fixing…" : "Fix missing credit journals"}
                    </button>
                  </Show>
                  <button
                    type="button"
                    class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                    disabled={closing() || h().fiscal.is_closed || !h().ready_to_close}
                    title={!h().ready_to_close ? blockReasons().join("; ") : undefined}
                    onClick={() => void closePeriod()}
                  >
                    {closing() ? "Closing…" : "Close period"}
                  </button>
                </div>
              </div>
              <Show when={!h().ready_to_close && blockReasons().length > 0}>
                <ul class="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-800">
                  <For each={blockReasons()}>{(reason) => <li>{reason}</li>}</For>
                </ul>
              </Show>
            </section>

            <section class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <HealthStat label="Draft journals" value={h().draft_journal_entries} href="/app/finance/acct-i/journal-entries" warn={h().draft_journal_entries > 0} />
              <HealthStat label="Audit-only OR/PV" value={h().audit_only_pending} href="/app/finance/official-receipts" warn={h().audit_only_pending > 0} />
              <HealthStat label="Unmatched bank" value={h().unmatched_bank_lines} href="/app/finance/acct-i/bank-reconciliation" warn={h().unmatched_bank_lines > 0} />
              <HealthStat label="Credits missing JE" value={h().credits_missing_je} href="/app/sales/credit-notes" warn={h().credits_missing_je > 0} />
            </section>

            <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
              <h2 class="text-sm font-semibold text-text-primary">Exception queue</h2>
              <Show when={(h().exceptions ?? []).length > 0} fallback={<p class="mt-2 text-sm text-text-secondary">No exceptions — books look clear for this as-of date.</p>}>
                <ul class="mt-3 divide-y divide-stroke">
                  <For each={h().exceptions as BooksHealthException[]}>
                    {(ex) => (
                      <li class="flex flex-wrap items-center justify-between gap-2 py-3">
                        <div>
                          <p class="text-sm font-medium text-text-primary">{ex.label}</p>
                          <p class="text-xs text-text-secondary">
                            {ex.severity === "block" ? "Blocks close" : "Warning"} · count {ex.count}
                          </p>
                        </div>
                        <A href={ex.href} class="text-sm font-medium text-brand-600 hover:underline">
                          Open →
                        </A>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </section>

            <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
              <h2 class="text-sm font-semibold text-text-primary">Month-close checklist</h2>
              <p class="mt-1 text-xs text-text-secondary">Live status from books health — not stored checkboxes.</p>
              <For each={sections()}>
                {([section, items]) => (
                  <div class="mt-4">
                    <h3 class="text-xs font-semibold uppercase tracking-wide text-text-secondary">{section}</h3>
                    <ul class="mt-2 space-y-2">
                      <For each={items}>
                        {(item) => {
                          const st = () => (health.data ? item.status(health.data) : "na");
                          return (
                            <li class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stroke px-3 py-2">
                              <div class="min-w-0">
                                <A href={item.href} class="text-sm font-medium text-brand-600 hover:underline">
                                  {item.label}
                                </A>
                                <Show when={health.data && item.detail}>
                                  <p class="text-xs text-text-secondary">{item.detail!(health.data!)}</p>
                                </Show>
                              </div>
                              <span class={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadge(st())}`}>{statusLabel(st())}</span>
                            </li>
                          );
                        }}
                      </For>
                    </ul>
                  </div>
                )}
              </For>
            </section>
          </>
        )}
      </Show>

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

function HealthStat(props: { label: string; value: number; href: string; warn?: boolean }) {
  return (
    <A
      href={props.href}
      class={`rounded-xl border bg-white p-4 shadow-sm transition hover:shadow-md ${props.warn ? "border-amber-300" : "border-stroke"}`}
    >
      <p class="text-sm text-text-secondary">{props.label}</p>
      <p class={`mt-2 text-3xl font-bold ${props.warn ? "text-amber-700" : "text-text-primary"}`}>{props.value}</p>
    </A>
  );
}
