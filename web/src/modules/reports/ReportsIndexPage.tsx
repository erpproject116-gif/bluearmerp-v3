import { A } from "@solidjs/router";
import { createMemo, createSignal, For, Show } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";

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
  "ar-aging": "Who owes us, and how long.",
  "ap-aging": "What we still owe suppliers.",
  "profit-and-loss": "Income and expenses for a period.",
  "balance-sheet": "What we own and owe.",
  "cash-flow-statement": "Cash in and cash out.",
  "trial-balance": "Account balances that should sum to zero.",
};

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
      const res = await apiFetch<{ id: number; name: string; report_label?: string; report_key: string }[]>(
        "/api/v1/bi/saved-views?pageSize=5",
      );
      if (!res.success) return [];
      return res.data ?? [];
    },
  }));
}

export default function ReportsIndexPage() {
  const catalog = useReportCatalog();
  const savedViews = useSavedViews();
  const [q, setQ] = createSignal("");
  const [category, setCategory] = createSignal<string>("all");

  const categories = createMemo(() => {
    const set = new Map<string, string>();
    for (const r of catalog.data ?? []) {
      set.set(r.module, moduleLabels[r.module] ?? r.module);
    }
    return [...set.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  });

  const filtered = createMemo(() => {
    const needle = q().trim().toLowerCase();
    let list = catalog.data ?? [];
    if (category() !== "all") list = list.filter((r) => r.module === category());
    if (needle) {
      list = list.filter(
        (r) =>
          r.label.toLowerCase().includes(needle) ||
          (r.description ?? "").toLowerCase().includes(needle) ||
          (plainBlurbs[r.key] ?? "").toLowerCase().includes(needle) ||
          (moduleLabels[r.module] ?? r.module).toLowerCase().includes(needle),
      );
    }
    return [...list].sort((a, b) => a.label.localeCompare(b.label));
  });

  return (
    <div class="space-y-6">
      <section class="rounded-xl border border-stroke bg-surface p-5 shadow-sm">
        <div class="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 class="text-xl font-semibold text-text-primary">Reports Center</h2>
            <p class="mt-1 text-sm text-text-secondary">
              Find sales, purchasing, inventory, and accounting reports by name or category.
            </p>
          </div>
          <label class="block w-full max-w-md">
            <span class="sr-only">Search reports</span>
            <input
              type="search"
              class="w-full rounded-lg border border-stroke bg-panel px-3 py-2 text-sm"
              placeholder="Search reports…"
              value={q()}
              onInput={(e) => setQ(e.currentTarget.value)}
            />
          </label>
        </div>
        <div class="mt-4 flex flex-wrap gap-2 text-sm">
          <A href="/app/selling/reports" class="rounded-lg border border-stroke px-3 py-1.5 hover:bg-brand-50">
            Sales reports
          </A>
          <A href="/app/buying/reports" class="rounded-lg border border-stroke px-3 py-1.5 hover:bg-brand-50">
            Purchasing reports
          </A>
          <A href="/app/finance/reports" class="rounded-lg border border-stroke px-3 py-1.5 hover:bg-brand-50">
            Accounting reports
          </A>
          <A href="/app/sales-order/reports" class="rounded-lg border border-stroke px-3 py-1.5 hover:bg-brand-50">
            Sales order reports
          </A>
        </div>
      </section>

      <section class="rounded-xl border border-stroke bg-surface p-5 shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold text-text-primary">Saved views</h2>
            <p class="text-sm text-text-secondary">Named filter sets you use often.</p>
          </div>
          <A href="/app/reports/saved-views" class="text-sm font-medium text-brand-600 hover:underline">
            Manage saved views
          </A>
        </div>
        <Show when={savedViews.data?.length}>
          <ul class="mt-4 flex flex-wrap gap-2">
            <For each={savedViews.data ?? []}>
              {(view) => (
                <li class="rounded-lg border border-stroke/80 px-3 py-2 text-sm">
                  <span class="font-medium">{view.name}</span>
                  <span class="text-text-secondary"> · {view.report_label ?? view.report_key}</span>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </section>

      <Show when={catalog.isLoading}>
        <p class="text-sm text-text-secondary">Loading catalog…</p>
      </Show>
      <Show when={catalog.isError}>
        <p class="text-sm text-red-600">{(catalog.error as Error)?.message ?? "Failed to load catalog."}</p>
      </Show>

      <Show when={!catalog.isLoading && !catalog.isError}>
        <div class="grid gap-6 lg:grid-cols-[14rem_1fr]">
          <aside class="rounded-xl border border-stroke bg-surface p-3 shadow-sm">
            <p class="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Report category
            </p>
            <nav class="space-y-0.5">
              <button
                type="button"
                class="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors"
                classList={{
                  "bg-brand-50 text-brand-600": category() === "all",
                  "text-text-secondary hover:erp-panel": category() !== "all",
                }}
                onClick={() => setCategory("all")}
              >
                All reports
              </button>
              <For each={categories()}>
                {([id, label]) => (
                  <button
                    type="button"
                    class="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors"
                    classList={{
                      "bg-brand-50 text-brand-600": category() === id,
                      "text-text-secondary hover:erp-panel": category() !== id,
                    }}
                    onClick={() => setCategory(id)}
                  >
                    {label}
                  </button>
                )}
              </For>
            </nav>
          </aside>

          <section class="rounded-xl border border-stroke bg-surface p-5 shadow-sm">
            <div class="mb-4 flex items-center gap-2">
              <h3 class="text-lg font-semibold text-text-primary">
                {category() === "all" ? "All reports" : moduleLabels[category()] ?? category()}
              </h3>
              <span class="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
                {filtered().length}
              </span>
            </div>
            <Show when={filtered().length === 0}>
              <p class="text-sm text-text-secondary">No reports match your search.</p>
            </Show>
            <div class="overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead class="border-b border-stroke text-left text-xs uppercase tracking-wide text-text-secondary">
                  <tr>
                    <th class="px-2 py-2 font-semibold">Report name</th>
                    <th class="px-2 py-2 font-semibold">Category</th>
                    <th class="px-2 py-2 font-semibold">About</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={filtered()}>
                    {(report) => (
                      <tr class="border-b border-stroke/60">
                        <td class="px-2 py-3">
                          <Show
                            when={report.web_path}
                            fallback={<span class="font-medium text-text-primary">{report.label}</span>}
                          >
                            <A href={report.web_path!} class="font-medium text-brand-600 hover:underline">
                              {report.label}
                            </A>
                          </Show>
                        </td>
                        <td class="px-2 py-3 text-text-secondary">
                          {moduleLabels[report.module] ?? report.module}
                        </td>
                        <td class="px-2 py-3 text-text-secondary">
                          {plainBlurbs[report.key] ?? report.description ?? "—"}
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </Show>
    </div>
  );
}
