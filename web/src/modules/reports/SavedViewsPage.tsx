import { createSignal, For, Show } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch, getAccessToken } from "../../shared/api";

type SavedView = {
  id: number;
  name: string;
  report_key: string;
  report_label?: string;
  filters: Record<string, string>;
  created_at: string;
  updated_at: string;
};

type ReportCatalogEntry = {
  key: string;
  label: string;
  export_path?: string;
};

function useSavedViews() {
  return createQuery(() => ({
    queryKey: ["bi-saved-views"],
    queryFn: async () => {
      const res = await apiFetch<SavedView[]>("/api/v1/bi/saved-views?pageSize=100");
      if (!res.success) throw new Error(res.message ?? "Failed to load saved views");
      return res.data ?? [];
    },
  }));
}

function useReportCatalog() {
  return createQuery(() => ({
    queryKey: ["reports-catalog"],
    queryFn: async () => {
      const res = await apiFetch<ReportCatalogEntry[]>("/api/v1/reports/catalog");
      if (!res.success) throw new Error(res.message ?? "Failed to load catalog");
      return res.data ?? [];
    },
    staleTime: 60_000,
  }));
}

export default function SavedViewsPage() {
  const qc = useQueryClient();
  const views = useSavedViews();
  const catalog = useReportCatalog();
  const [name, setName] = createSignal("");
  const [reportKey, setReportKey] = createSignal("");
  const [dateFrom, setDateFrom] = createSignal("");
  const [dateTo, setDateTo] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const saveView = async () => {
    setSaving(true);
    setError(null);
    const filters: Record<string, string> = {};
    if (dateFrom()) filters.date_from = dateFrom();
    if (dateTo()) filters.date_to = dateTo();
    const res = await apiFetch<SavedView>("/api/v1/bi/saved-views", {
      method: "POST",
      body: JSON.stringify({
        name: name().trim(),
        report_key: reportKey(),
        filters,
      }),
    });
    setSaving(false);
    if (!res.success) {
      setError(res.message ?? "Failed to save view.");
      return;
    }
    setName("");
    setDateFrom("");
    setDateTo("");
    void qc.invalidateQueries({ queryKey: ["bi-saved-views"] });
  };

  const deleteView = async (id: number) => {
    const res = await apiFetch(`/api/v1/bi/saved-views/${id}`, { method: "DELETE" });
    if (!res.success) {
      setError(res.message ?? "Failed to delete.");
      return;
    }
    void qc.invalidateQueries({ queryKey: ["bi-saved-views"] });
  };

  const exportView = async (view: SavedView) => {
    const token = await getAccessToken();
    const url = `/api/v1/bi/export/${encodeURIComponent(view.report_key)}?saved_view_id=${view.id}`;
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      setError("Export failed.");
      return;
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${view.report_key}-${view.name}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div class="space-y-6">
      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <h2 class="text-lg font-semibold text-text-primary">Saved report views</h2>
        <p class="text-sm text-text-secondary">
          Save named filter sets and export via the BI proxy to catalog report exports.
        </p>
      </section>

      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <h3 class="mb-4 text-sm font-semibold text-text-primary">New saved view</h3>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            class="rounded-lg border border-stroke px-3 py-2 text-sm"
            placeholder="View name"
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
          />
          <select
            class="rounded-lg border border-stroke px-3 py-2 text-sm"
            value={reportKey()}
            onChange={(e) => setReportKey(e.currentTarget.value)}
          >
            <option value="">Select report…</option>
            <For each={catalog.data ?? []}>
              {(r) => (
                <option value={r.key} disabled={!r.export_path}>
                  {r.label}
                  {!r.export_path ? " (no export)" : ""}
                </option>
              )}
            </For>
          </select>
          <input
            type="date"
            class="rounded-lg border border-stroke px-3 py-2 text-sm"
            value={dateFrom()}
            onInput={(e) => setDateFrom(e.currentTarget.value)}
          />
          <input
            type="date"
            class="rounded-lg border border-stroke px-3 py-2 text-sm"
            value={dateTo()}
            onInput={(e) => setDateTo(e.currentTarget.value)}
          />
        </div>
        <button
          type="button"
          class="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          disabled={saving() || !name().trim() || !reportKey()}
          onClick={() => void saveView()}
        >
          {saving() ? "Saving…" : "Save view"}
        </button>
        <Show when={error()}>
          <p class="mt-2 text-sm text-red-600">{error()}</p>
        </Show>
      </section>

      <Show when={views.isLoading}>
        <p class="text-sm text-text-secondary">Loading saved views…</p>
      </Show>

      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <ul class="divide-y divide-stroke/60">
          <For each={views.data ?? []}>
            {(view) => (
              <li class="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p class="text-sm font-medium text-text-primary">{view.name}</p>
                  <p class="text-xs text-text-secondary">
                    {view.report_label ?? view.report_key} · updated {view.updated_at}
                  </p>
                </div>
                <div class="flex gap-2">
                  <button
                    type="button"
                    class="rounded-lg border border-stroke px-3 py-1.5 text-xs font-medium hover:bg-surface"
                    onClick={() => void exportView(view)}
                  >
                    Export CSV
                  </button>
                  <button
                    type="button"
                    class="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                    onClick={() => void deleteView(view.id)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            )}
          </For>
        </ul>
        <Show when={!views.isLoading && (views.data?.length ?? 0) === 0}>
          <p class="text-sm text-text-secondary">No saved views yet.</p>
        </Show>
      </section>
    </div>
  );
}
