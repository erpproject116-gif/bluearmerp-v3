import { PageSizeSelect } from "../../../shared/pageSize";
import { createSignal, For, onMount } from "solid-js";
import { DateInput } from "../../../shared/DateInput";
import { Field } from "../../../shared/SpreadsheetGrid";
import { CollapsibleFilterPanel } from "../../../shared/CollapsibleFilterPanel";
import { useAuth } from "../../../shared/auth-context";
import { getAccessToken } from "../../../shared/api";
import { itemDemandExportUrl, useItemDemandReport, type ItemDemandFilters } from "../../../shared/useCrmReports";
import { CrmLayout } from "../CrmLayout";

function defaultFilters(): ItemDemandFilters {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 3);
  return { date_from: from.toISOString().slice(0, 10), date_to: to.toISOString().slice(0, 10) };
}

export default function ItemDemandReportPage() {
  const [draft, setDraft] = createSignal<ItemDemandFilters>(defaultFilters());
  const [submitted, setSubmitted] = createSignal<ItemDemandFilters>(defaultFilters());
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const [pageSize, setPageSize] = createSignal(50);
  const auth = useAuth();

  const report = useItemDemandReport(() => ({
    filters: submitted(),
    page: page(),
    pageSize: pageSize(),
    sort: "quoted_qty",
    order: "desc",
    enabled: true,
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
    setSubmitted({ ...draft() });
    setPage(1);
    setGeneratedAt(new Date());
  };

  const reset = () => {
    const next = defaultFilters();
    setDraft(next);
    setSubmitted(next);
    setPage(1);
    setGeneratedAt(new Date());
  };

  const downloadCsv = async () => {
    const f = submitted();
    const token = await getAccessToken();
    const res = await fetch(itemDemandExportUrl(f), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "item-demand.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = () => Math.max(1, Math.ceil((report.data?.total ?? 0) / pageSize()));

  return (
    <CrmLayout>
      <CollapsibleFilterPanel
        title="Item demand"
        description="Quoted vs sold quantities per item — defaults to last 3 months, then Search (F8)."
        actions={
          <>
            <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white" onClick={search}>
              Search (F8)
            </button>
            <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={reset}>
              Reset
            </button>
          </>
        }
      >
        <div class="grid gap-4 md:grid-cols-2">
          <Field label="Date from">
            <DateInput
              value={draft().date_from ?? ""}
              onInput={(e) => setDraft((f) => ({ ...f, date_from: e.currentTarget.value || undefined }))}
            />
          </Field>
          <Field label="Date to">
            <DateInput
              value={draft().date_to ?? ""}
              onInput={(e) => setDraft((f) => ({ ...f, date_to: e.currentTarget.value || undefined }))}
            />
          </Field>
        </div>
      </CollapsibleFilterPanel>

      <section class="mt-6 rounded-xl border border-stroke bg-white shadow-sm">
        <div class="border-b border-stroke px-5 py-4 text-center">
          <h2 class="text-xl font-bold">Item demand</h2>
          <p class="text-sm text-text-secondary">{auth.me?.tenant.company_name}</p>
        </div>
        <div class="overflow-x-auto">
          <table class="erp-grid min-w-full text-left text-sm">
            <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
              <tr>
                <th class="px-3 py-2">Item</th>
                <th class="px-3 py-2 text-right">Quoted qty</th>
                <th class="px-3 py-2 text-right">Sold qty</th>
                <th class="px-3 py-2 text-right">Quote count</th>
                <th class="px-3 py-2 text-right">Sales count</th>
              </tr>
            </thead>
            <tbody>
              <For each={report.data?.rows ?? []}>
                {(row) => (
                  <tr class="border-t border-stroke/60">
                    <td class="px-3 py-2">
                      {row.item_code} — {row.item_name}
                    </td>
                    <td class="px-3 py-2 text-right">{row.quoted_qty}</td>
                    <td class="px-3 py-2 text-right">{row.sold_qty}</td>
                    <td class="px-3 py-2 text-right">{row.quotation_count}</td>
                    <td class="px-3 py-2 text-right">{row.sales_count}</td>
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
            <PageSizeSelect value={pageSize()} onChange={(n) => { setPageSize(n); setPage(1); }} />
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
    </CrmLayout>
  );
}
