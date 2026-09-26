import { A, useSearchParams } from "@solidjs/router";
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { reportsDateRangeFromQuery, withReportDateQuery } from "../../shared/reports/ReportDatePresets";
import { ReportsBiDashboard } from "./ReportsBiDashboard";

type ReportCatalogEntry = {
  key: string;
  label: string;
  module: string;
  api_path: string;
  export_path?: string;
  web_path?: string;
  tier: string;
  description?: string;
};

type ReportGroup = {
  id: string;
  label: string;
  modules: string[];
  blurb: string;
  /** Optional keys that belong in a “most used” strip for this group */
  featuredKeys?: string[];
};

const REPORT_GROUPS: ReportGroup[] = [
  {
    id: "business_overview",
    label: "Business overview",
    modules: ["finance"],
    blurb: "Profit & loss, balance sheet, cash, and ledgers.",
    featuredKeys: ["profit_and_loss", "balance_sheet", "trial_balance", "ar_aging", "ap_aging"],
  },
  {
    id: "sales",
    label: "Sales",
    modules: ["sales", "selling", "sales-order"],
    blurb: "Invoices, receivables, orders, and shipments.",
    featuredKeys: ["customer_credit_balance", "so_analysis", "shipment_status"],
  },
  {
    id: "purchases",
    label: "Purchases",
    modules: ["buying", "purchase-order"],
    blurb: "Bills, payables, POs, and receiving.",
    featuredKeys: ["po_status", "po_outstanding", "purchase_status", "items_to_receive"],
  },
  {
    id: "inventory",
    label: "Inventory",
    modules: ["inventory"],
    blurb: "On hand, movements, ageing, and stock books.",
    featuredKeys: ["stock_balance", "inventory_on_hand", "stock_ledger"],
  },
  {
    id: "crm",
    label: "CRM",
    modules: ["crm"],
    blurb: "Quotes, conversion, and demand.",
    featuredKeys: ["conversion_funnel", "expired_quotations", "item_demand"],
  },
];

const GLOBAL_QUICK: { key: string; fallbackLabel: string }[] = [
  { key: "profit_and_loss", fallbackLabel: "Profit & Loss" },
  { key: "balance_sheet", fallbackLabel: "Balance Sheet" },
  { key: "ar_aging", fallbackLabel: "Accounts receivable aging" },
  { key: "ap_aging", fallbackLabel: "Accounts payable aging" },
  { key: "stock_balance", fallbackLabel: "Stock Balance" },
  { key: "so_analysis", fallbackLabel: "Sales order analysis" },
];

const moduleLabels: Record<string, string> = {
  "sales-order": "Sales orders",
  "purchase-order": "Purchasing",
  inventory: "Inventory",
  finance: "Accounting",
  sales: "Sales",
  crm: "CRM",
  buying: "Purchasing",
  selling: "Sales",
};

const plainBlurbs: Record<string, string> = {
  ar_aging: "Who owes us, and how long.",
  ap_aging: "What we still owe suppliers.",
  profit_and_loss: "Income and expenses for a period.",
  balance_sheet: "What we own and owe.",
  cash_flow_statement: "Cash in and cash out.",
  trial_balance: "Account balances that should sum to zero.",
  stock_balance: "On-hand quantity by item and location.",
  customer_credit_balance: "Credit limit vs open customer balance.",
};

const FAV_KEY = "bluearm-report-favorites";
const RECENT_KEY = "bluearm-report-recent";

function loadKeys(storageKey: string): string[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveKeys(storageKey: string, keys: string[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(keys.slice(0, 24)));
  } catch {
    /* ignore */
  }
}

function useReportCatalog() {
  return createQuery(() => ({
    queryKey: ["reports-catalog"],
    queryFn: async () => {
      const res = await apiFetch<ReportCatalogEntry[]>("/api/v1/reports/catalog");
      if (!res.success) throw new Error(res.message ?? "Failed to load report catalog");
      return res.data ?? [];
    },
    staleTime: 60_000,
  }));
}

function useSavedViews() {
  return createQuery(() => ({
    queryKey: ["bi-saved-views"],
    queryFn: async () => {
      const res = await apiFetch<{ id: number; name: string; report_label?: string; report_key: string; web_path?: string }[]>(
        "/api/v1/bi/saved-views?pageSize=8",
      );
      if (!res.success) return [];
      return res.data ?? [];
    },
  }));
}

function blurbFor(r: ReportCatalogEntry): string {
  return plainBlurbs[r.key] ?? r.description ?? moduleLabels[r.module] ?? r.module;
}

function ReportRow(props: {
  report: ReportCatalogEntry;
  favorited: boolean;
  onToggleFavorite: () => void;
  onOpen: () => void;
  href?: string;
}) {
  const r = () => props.report;
  const href = () => props.href ?? r().web_path;
  return (
    <li class="group flex flex-wrap items-center gap-3 border-b border-stroke/60 py-3 last:border-0">
      <button
        type="button"
        class="shrink-0 rounded p-1 text-lg leading-none transition"
        classList={{
          "text-amber-500": props.favorited,
          "text-slate-300 hover:text-amber-400": !props.favorited,
        }}
        title={props.favorited ? "Remove from favorites" : "Add to favorites"}
        aria-label={props.favorited ? "Unfavorite" : "Favorite"}
        onClick={() => props.onToggleFavorite()}
      >
        ★
      </button>
      <div class="min-w-0 flex-1">
        <Show
          when={href()}
          fallback={<span class="font-medium text-text-primary">{r().label}</span>}
        >
          <A
            href={href()!}
            class="font-medium text-brand-600 hover:underline"
            onClick={() => props.onOpen()}
          >
            {r().label}
          </A>
        </Show>
        <p class="mt-0.5 text-sm text-text-secondary">{blurbFor(r())}</p>
      </div>
      <span class="hidden shrink-0 text-xs uppercase tracking-wide text-text-secondary sm:inline">
        {moduleLabels[r().module] ?? r().module}
      </span>
      <Show when={href()}>
        <A
          href={href()!}
          class="shrink-0 rounded-lg border border-stroke px-3 py-1.5 text-sm font-medium text-text-primary transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
          onClick={() => props.onOpen()}
        >
          Open
        </A>
      </Show>
    </li>
  );
}

export default function ReportsIndexPage() {
  const catalog = useReportCatalog();
  const savedViews = useSavedViews();
  const [params] = useSearchParams();
  const dateRange = createMemo(() => reportsDateRangeFromQuery(params));
  const datedHref = (href?: string) =>
    href ? withReportDateQuery(href, dateRange().from, dateRange().to) : href;
  const [q, setQ] = createSignal("");
  const [group, setGroup] = createSignal<string>("all");
  const [favorites, setFavorites] = createSignal<string[]>(loadKeys(FAV_KEY));
  const [recent, setRecent] = createSignal<string[]>(loadKeys(RECENT_KEY));
  let searchRef: HTMLInputElement | undefined;

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        searchRef?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  createEffect(() => {
    saveKeys(FAV_KEY, favorites());
  });
  createEffect(() => {
    saveKeys(RECENT_KEY, recent());
  });

  const byKey = createMemo(() => {
    const map = new Map<string, ReportCatalogEntry>();
    for (const r of catalog.data ?? []) map.set(r.key, r);
    return map;
  });

  const groupCounts = createMemo(() => {
    const list = catalog.data ?? [];
    const counts: Record<string, number> = { all: list.length };
    for (const g of REPORT_GROUPS) {
      counts[g.id] = list.filter((r) => g.modules.includes(r.module)).length;
    }
    const known = new Set(REPORT_GROUPS.flatMap((x) => x.modules));
    counts.other = list.filter((r) => !known.has(r.module)).length;
    return counts;
  });

  const filtered = createMemo(() => {
    const needle = q().trim().toLowerCase();
    let list = catalog.data ?? [];
    if (group() !== "all") {
      const g = REPORT_GROUPS.find((x) => x.id === group());
      if (g) list = list.filter((r) => g.modules.includes(r.module));
      else if (group() === "other") {
        const known = new Set(REPORT_GROUPS.flatMap((x) => x.modules));
        list = list.filter((r) => !known.has(r.module));
      } else if (group() === "favorites") {
        const fav = new Set(favorites());
        list = list.filter((r) => fav.has(r.key));
      }
    }
    if (needle) {
      list = list.filter(
        (r) =>
          r.label.toLowerCase().includes(needle) ||
          r.key.toLowerCase().includes(needle) ||
          (r.description ?? "").toLowerCase().includes(needle) ||
          blurbFor(r).toLowerCase().includes(needle) ||
          (moduleLabels[r.module] ?? r.module).toLowerCase().includes(needle),
      );
    }
    return [...list].sort((a, b) => a.label.localeCompare(b.label));
  });

  const groupedSections = createMemo(() => {
    const list = filtered();
    if (group() === "favorites") {
      return list.length
        ? [{ id: "favorites", label: "Favorites", blurb: "Reports you marked with a star.", reports: list }]
        : [];
    }
    const sections: { id: string; label: string; blurb: string; reports: ReportCatalogEntry[] }[] = [];
    for (const g of REPORT_GROUPS) {
      if (group() !== "all" && group() !== g.id) continue;
      const reports = list.filter((r) => g.modules.includes(r.module));
      if (reports.length) sections.push({ id: g.id, label: g.label, blurb: g.blurb, reports });
    }
    if (group() === "all" || group() === "other") {
      const known = new Set(REPORT_GROUPS.flatMap((x) => x.modules));
      const other = list.filter((r) => !known.has(r.module));
      if (other.length) {
        sections.push({ id: "other", label: "Other", blurb: "Additional reports.", reports: other });
      }
    }
    return sections;
  });

  const quickReports = createMemo(() => {
    const map = byKey();
    return GLOBAL_QUICK.map((q) => {
      const hit = map.get(q.key);
      return {
        key: q.key,
        label: hit?.label ?? q.fallbackLabel,
        href: hit?.web_path,
        blurb: hit ? blurbFor(hit) : "",
      };
    }).filter((x) => x.href);
  });

  const recentReports = createMemo(() =>
    recent()
      .map((k) => byKey().get(k))
      .filter((r): r is ReportCatalogEntry => !!r && !!r.web_path)
      .slice(0, 6),
  );

  const favoriteReports = createMemo(() =>
    favorites()
      .map((k) => byKey().get(k))
      .filter((r): r is ReportCatalogEntry => !!r)
      .slice(0, 8),
  );

  const markRecent = (key: string) => {
    setRecent((prev) => [key, ...prev.filter((k) => k !== key)].slice(0, 12));
  };

  const toggleFavorite = (key: string) => {
    setFavorites((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [key, ...prev]));
  };

  const searching = () => q().trim().length > 0;

  return (
    <div class="w-full space-y-5">
      {/* BI dashboard — period summary + ops intelligence charts (formerly ?tab=intel / period-summary) */}
      <section id="reports-bi" class="scroll-mt-4 rounded-xl border border-brand-200 bg-surface p-5 shadow-sm">
        <ReportsBiDashboard opsVariant="full" />
      </section>

      {/* Hero + search */}
      <section id="report-catalog" class="scroll-mt-4 rounded-xl border border-stroke bg-surface p-5 shadow-sm">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 class="text-2xl font-semibold tracking-tight text-text-primary">Report catalog</h1>
            <p class="mt-1 max-w-xl text-sm text-text-secondary">
              Find any operational report — search, pin favorites, or jump by category. Charts and KPIs are above. Press{" "}
              <kbd class="rounded border border-stroke bg-panel px-1.5 py-0.5 text-xs">/</kbd> to focus search.
            </p>
          </div>
          <label class="block w-full max-w-lg">
            <span class="mb-1 block text-xs font-medium text-text-secondary">Search reports</span>
            <div class="relative">
              <svg class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path stroke-linecap="round" d="M20 20l-3-3" />
              </svg>
              <input
                ref={searchRef}
                type="search"
                class="w-full rounded-lg border border-stroke bg-panel py-2.5 pl-9 pr-20 text-sm outline-none ring-brand-500 focus:ring-2"
                placeholder="Try “aging”, “stock”, “profit”…"
                value={q()}
                onInput={(e) => {
                  setQ(e.currentTarget.value);
                  if (e.currentTarget.value.trim()) setGroup("all");
                }}
              />
              <Show when={searching()}>
                <button
                  type="button"
                  class="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-text-secondary hover:bg-slate-100"
                  onClick={() => setQ("")}
                >
                  Clear
                </button>
              </Show>
            </div>
            <Show when={searching()}>
              <p class="mt-1.5 text-xs text-text-secondary">{filtered().length} match{filtered().length === 1 ? "" : "es"}</p>
            </Show>
          </label>
        </div>

        {/* Quick links */}
        <div class="mt-5">
          <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">Quick access</p>
          <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <For each={quickReports()}>
              {(item) => (
                <A
                  href={datedHref(item.href)!}
                  class="rounded-lg border border-stroke px-3 py-2.5 transition hover:border-brand-300 hover:bg-brand-50"
                  onClick={() => markRecent(item.key)}
                >
                  <span class="block text-sm font-medium text-text-primary">{item.label}</span>
                  <Show when={item.blurb}>
                    <span class="mt-0.5 block text-xs text-text-secondary line-clamp-1">{item.blurb}</span>
                  </Show>
                </A>
              )}
            </For>
          </div>
        </div>

        <div class="mt-4 flex flex-wrap gap-2 text-sm">
          <A href="/app/selling/reports" class="rounded-lg border border-stroke px-3 py-1.5 hover:bg-brand-50">Sales hub</A>
          <A href="/app/buying/reports" class="rounded-lg border border-stroke px-3 py-1.5 hover:bg-brand-50">Purchasing hub</A>
          <A href="/app/finance/reports" class="rounded-lg border border-stroke px-3 py-1.5 hover:bg-brand-50">Accounting hub</A>
          <A href="/app/reports/saved-views" class="rounded-lg border border-stroke px-3 py-1.5 hover:bg-brand-50">Saved views</A>
        </div>
      </section>

      {/* Favorites + recent */}
      <div class="grid gap-4 lg:grid-cols-2">
        <section class="rounded-xl border border-stroke bg-surface p-4 shadow-sm">
          <div class="mb-3 flex items-center justify-between">
            <h2 class="text-sm font-semibold text-text-primary">Favorites</h2>
            <button type="button" class="text-xs text-brand-600 hover:underline" onClick={() => setGroup("favorites")}>
              View all
            </button>
          </div>
          <Show
            when={favoriteReports().length}
            fallback={<p class="text-sm text-text-secondary">Star any report below to pin it here.</p>}
          >
            <ul class="space-y-1">
              <For each={favoriteReports()}>
                {(r) => (
                  <li>
                    <Show
                      when={r.web_path}
                      fallback={<span class="text-sm text-text-primary">{r.label}</span>}
                    >
                      <A
                        href={datedHref(r.web_path)!}
                        class="block rounded-lg px-2 py-1.5 text-sm text-brand-600 hover:bg-brand-50"
                        onClick={() => markRecent(r.key)}
                      >
                        ★ {r.label}
                      </A>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </section>
        <section class="rounded-xl border border-stroke bg-surface p-4 shadow-sm">
          <h2 class="mb-3 text-sm font-semibold text-text-primary">Recently opened</h2>
          <Show
            when={recentReports().length}
            fallback={<p class="text-sm text-text-secondary">Reports you open will show up here.</p>}
          >
            <ul class="space-y-1">
              <For each={recentReports()}>
                {(r) => (
                  <li>
                    <A
                      href={datedHref(r.web_path)!}
                      class="block rounded-lg px-2 py-1.5 text-sm text-text-primary hover:bg-slate-50"
                      onClick={() => markRecent(r.key)}
                    >
                      {r.label}
                      <span class="ml-2 text-xs text-text-secondary">{moduleLabels[r.module] ?? r.module}</span>
                    </A>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </section>
      </div>

      <Show when={savedViews.data?.length}>
        <section class="rounded-xl border border-stroke bg-surface p-4 shadow-sm">
          <div class="mb-2 flex items-center justify-between">
            <h2 class="text-sm font-semibold text-text-primary">Saved views</h2>
            <A href="/app/reports/saved-views" class="text-xs font-medium text-brand-600 hover:underline">Manage</A>
          </div>
          <ul class="flex flex-wrap gap-2">
            <For each={savedViews.data ?? []}>
              {(view) => (
                <li class="rounded-lg border border-stroke/80 px-3 py-1.5 text-sm">
                  <span class="font-medium">{view.name}</span>
                  <span class="text-text-secondary"> · {view.report_label ?? view.report_key}</span>
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>

      <Show when={catalog.isLoading}>
        <p class="text-sm text-text-secondary">Loading catalog…</p>
      </Show>
      <Show when={catalog.isError}>
        <p class="text-sm text-red-600">{(catalog.error as Error)?.message ?? "Failed to load catalog."}</p>
      </Show>

      <Show when={!catalog.isLoading && !catalog.isError}>
        {/* Mobile category chips */}
        <div class="flex gap-2 overflow-x-auto pb-1 lg:hidden">
          <button
            type="button"
            class="shrink-0 rounded-full border px-3 py-1.5 text-sm"
            classList={{
              "border-brand-500 bg-brand-50 text-brand-700": group() === "all",
              "border-stroke text-text-secondary": group() !== "all",
            }}
            onClick={() => setGroup("all")}
          >
            All ({groupCounts().all ?? 0})
          </button>
          <button
            type="button"
            class="shrink-0 rounded-full border px-3 py-1.5 text-sm"
            classList={{
              "border-brand-500 bg-brand-50 text-brand-700": group() === "favorites",
              "border-stroke text-text-secondary": group() !== "favorites",
            }}
            onClick={() => setGroup("favorites")}
          >
            Favorites ({favorites().length})
          </button>
          <For each={REPORT_GROUPS}>
            {(g) => (
              <button
                type="button"
                class="shrink-0 rounded-full border px-3 py-1.5 text-sm"
                classList={{
                  "border-brand-500 bg-brand-50 text-brand-700": group() === g.id,
                  "border-stroke text-text-secondary": group() !== g.id,
                }}
                onClick={() => setGroup(g.id)}
              >
                {g.label} ({groupCounts()[g.id] ?? 0})
              </button>
            )}
          </For>
        </div>

        <div class="grid gap-6 lg:grid-cols-[14rem_1fr]">
          <aside class="hidden h-fit rounded-xl border border-stroke bg-surface p-3 shadow-sm lg:sticky lg:top-4 lg:block">
            <p class="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">Browse</p>
            <nav class="space-y-0.5">
              <button
                type="button"
                class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors"
                classList={{
                  "bg-brand-50 text-brand-600": group() === "all",
                  "text-text-secondary hover:erp-panel": group() !== "all",
                }}
                onClick={() => setGroup("all")}
              >
                <span>All reports</span>
                <span class="text-xs opacity-70">{groupCounts().all ?? 0}</span>
              </button>
              <button
                type="button"
                class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors"
                classList={{
                  "bg-brand-50 text-brand-600": group() === "favorites",
                  "text-text-secondary hover:erp-panel": group() !== "favorites",
                }}
                onClick={() => setGroup("favorites")}
              >
                <span>Favorites</span>
                <span class="text-xs opacity-70">{favorites().length}</span>
              </button>
              <For each={REPORT_GROUPS}>
                {(g) => (
                  <button
                    type="button"
                    class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors"
                    classList={{
                      "bg-brand-50 text-brand-600": group() === g.id,
                      "text-text-secondary hover:erp-panel": group() !== g.id,
                    }}
                    onClick={() => setGroup(g.id)}
                  >
                    <span>{g.label}</span>
                    <span class="text-xs opacity-70">{groupCounts()[g.id] ?? 0}</span>
                  </button>
                )}
              </For>
            </nav>
            <Show when={group() === "all"}>
              <div class="mt-4 border-t border-stroke pt-3">
                <p class="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">Jump to</p>
                <ul class="space-y-0.5 px-1">
                  <For each={REPORT_GROUPS}>
                    {(g) => (
                      <li>
                        <a href={`#report-group-${g.id}`} class="block rounded px-2 py-1 text-xs text-text-secondary hover:bg-slate-50 hover:text-brand-600">
                          {g.label}
                        </a>
                      </li>
                    )}
                  </For>
                </ul>
              </div>
            </Show>
          </aside>

          <div class="space-y-5">
            <Show when={filtered().length === 0}>
              <p class="rounded-xl border border-stroke bg-surface p-5 text-sm text-text-secondary">
                <Show when={group() === "favorites"} fallback={<>No reports match your search. Try another word or clear the filter.</>}>
                  No favorites yet. Open the catalog and tap ★ on reports you use often.
                </Show>
              </p>
            </Show>
            <For each={groupedSections()}>
              {(section) => (
                <section id={`report-group-${section.id}`} class="scroll-mt-4 rounded-xl border border-stroke bg-surface p-5 shadow-sm">
                  <div class="mb-1 flex flex-wrap items-end justify-between gap-2 border-b border-stroke pb-3">
                    <div>
                      <h3 class="text-lg font-semibold text-text-primary">{section.label}</h3>
                      <p class="mt-0.5 text-sm text-text-secondary">{section.blurb}</p>
                    </div>
                    <span class="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-text-secondary">
                      {section.reports.length}
                    </span>
                  </div>
                  <ul>
                    <For each={section.reports}>
                      {(report) => (
                        <ReportRow
                          report={report}
                          favorited={favorites().includes(report.key)}
                          onToggleFavorite={() => toggleFavorite(report.key)}
                          onOpen={() => markRecent(report.key)}
                          href={datedHref(report.web_path)}
                        />
                      )}
                    </For>
                  </ul>
                </section>
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}
