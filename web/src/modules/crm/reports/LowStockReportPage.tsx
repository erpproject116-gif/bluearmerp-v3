import { createSignal, For, onMount, Show } from "solid-js";
import { useAuth } from "../../../shared/auth-context";
import { getAccessToken } from "../../../shared/api";
import { lowStockExportUrl, useLowStockReport, type LowStockFilters } from "../../../shared/useCrmReports";
import { CrmLayout } from "../CrmLayout";

export default function LowStockReportPage() {
  const [submitted, setSubmitted] = createSignal(true);
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const pageSize = 50;
  const auth = useAuth();
  const filters: LowStockFilters = {};

  const report = useLowStockReport(() => ({
    filters,
    page: page(),
    pageSize,
    sort: "shortfall",
    order: "desc",
    enabled: submitted(),
  }));

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F8") {
        e.preventDefault();
        search();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const search = () => {
    setSubmitted(true);
    setPage(1);
    setGeneratedAt(new Date());
  };

  const downloadCsv = async () => {
    const token = await getAccessToken();
    const res = await fetch(lowStockExportUrl(filters), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "low-stock.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = () => Math.max(1, Math.ceil((report.data?.total ?? 0) / pageSize));

  return (
    <CrmLayout>
      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <h2 class="text-lg font-semibold text-text-primary">Low stock</h2>
        <p class="text-sm text-text-secondary">
          SKUs below reorder level at each location — Search (F8).
        </p>
        <div class="mt-4 flex gap-2">
          <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white" onClick={search}>
            Search (F8)
          </button>
          <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={() => setSubmitted(false)}>
            Reset
          </button>
        </div>
      </section>

      <Show when={submitted()}>
        <section class="mt-6 rounded-xl border border-stroke bg-white shadow-sm">
          <div class="border-b border-stroke px-5 py-4 text-center">
            <h2 class="text-xl font-bold">Low stock report</h2>
            <p class="text-sm text-text-secondary">{auth.me?.tenant.company_name}</p>
          </div>
          <div class="overflow-x-auto">
            <table class="erp-grid min-w-full text-left text-sm">
              <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
                <tr>
                  <th class="px-3 py-2">Item</th>
                  <th class="px-3 py-2">Location</th>
                  <th class="px-3 py-2 text-right">On hand</th>
                  <th class="px-3 py-2 text-right">Reorder</th>
                  <th class="px-3 py-2 text-right">Shortfall</th>
                </tr>
              </thead>
              <tbody>
                <For each={report.data?.rows ?? []}>
                  {(row) => (
                    <tr class="border-t border-stroke/60">
                      <td class="px-3 py-2">
                        {row.item_code} — {row.item_name}
                      </td>
                      <td class="px-3 py-2">{row.location_name}</td>
                      <td class="px-3 py-2 text-right">{row.qty_on_hand}</td>
                      <td class="px-3 py-2 text-right">{row.reorder_level}</td>
                      <td class="px-3 py-2 text-right font-medium text-red-600">{row.shortfall}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-3 border-t border-stroke px-5 py-3 text-sm">
            <span>Generated {generatedAt().toLocaleString()}</span>
            <div class="flex gap-2">
              <button type="button" class="rounded border border-stroke px-3 py-1" onClick={() => void downloadCsv()}>
                Export CSV
              </button>
              <button
                type="button"
                class="rounded border border-stroke px-3 py-1 disabled:opacity-50"
                disabled={page() <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Prev
              </button>
              <span>
                Page {page()} / {totalPages()}
              </span>
              <button
                type="button"
                class="rounded border border-stroke px-3 py-1 disabled:opacity-50"
                disabled={page() >= totalPages()}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </section>
      </Show>
    </CrmLayout>
  );
}
