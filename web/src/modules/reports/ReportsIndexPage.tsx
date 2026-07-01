import { A } from "@solidjs/router";
import { createMemo, For, Show } from "solid-js";
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

type ModuleGroup = {
  module: string;
  label: string;
  reports: ReportCatalogEntry[];
};

const moduleLabels: Record<string, string> = {
  "sales-order": "Sales Order",
  "purchase-order": "Purchase Order",
  inventory: "Inventory",
  finance: "Finance",
  sales: "Sales",
  crm: "CRM",
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
  const groups = createMemo<ModuleGroup[]>(() => {
    const byModule = new Map<string, ReportCatalogEntry[]>();
    for (const report of catalog.data ?? []) {
      const list = byModule.get(report.module) ?? [];
      list.push(report);
      byModule.set(report.module, list);
    }
    return [...byModule.entries()]
      .map(([module, reports]) => ({
        module,
        label: moduleLabels[module] ?? module,
        reports: [...reports].sort((a, b) => a.label.localeCompare(b.label)),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  return (
    <div class="space-y-6">
      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <h2 class="text-lg font-semibold text-text-primary">Reports catalog</h2>
        <p class="text-sm text-text-secondary">
          Browse analytics and status reports registered across modules.
        </p>
      </section>

      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold text-text-primary">Saved views</h2>
            <p class="text-sm text-text-secondary">Quick access to your named report filter sets.</p>
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

      <Show when={catalog.isLoading} fallback={null}>        <p class="text-sm text-text-secondary">Loading catalog…</p>
      </Show>

      <Show when={catalog.isError}>
        <p class="text-sm text-red-600">{(catalog.error as Error)?.message ?? "Failed to load catalog."}</p>
      </Show>

      <Show when={!catalog.isLoading && !catalog.isError}>
        <For each={groups()}>
          {(group) => (
            <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
              <h3 class="mb-4 text-sm font-semibold text-text-primary">{group.label}</h3>
              <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <For each={group.reports}>
                  {(report) => (
                    <li class="rounded-lg border border-stroke/80 p-3">
                      <Show
                        when={report.web_path}
                        fallback={<span class="text-sm font-medium text-text-primary">{report.label}</span>}
                      >
                        <A href={report.web_path!} class="text-sm font-medium text-brand-600 hover:underline">
                          {report.label}
                        </A>
                      </Show>
                      <p class="mt-1 text-xs text-text-secondary">{report.tier}</p>
                      <Show when={report.description}>
                        <p class="mt-2 text-xs text-text-secondary">{report.description}</p>
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
            </section>
          )}
        </For>
      </Show>
    </div>
  );
}
