import { PageSizeSelect } from "../../../shared/pageSize";
import { createSignal, For, onMount } from "solid-js";
import { formatPeso } from "../../../shared/money";
import { downloadReportCsv } from "../../../shared/reports/downloadReportCsv";
import { arApStatusExportUrl, useArApStatusReport, type ArApStatusFilters } from "../../../shared/reports/useModuleReports";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { GridExportButtons } from "../../../shared/gridExport";
import { CollapsibleFilterPanel } from "../../../shared/CollapsibleFilterPanel";
import { FinanceLayout } from "../FinanceLayout";

const TYPE_TABS = [
  { value: "combined", label: "Combined" },
  { value: "receivable", label: "Receivable" },
  { value: "payable", label: "Payable" },
] as const;

function defaultFilters(): ArApStatusFilters {
  return { as_of: new Date().toISOString().slice(0, 10), status_type: "combined" };
}

export default function ArApStatusReportPage() {
  const [draft, setDraft] = createSignal<ArApStatusFilters>(defaultFilters());
  const [submitted, setSubmitted] = createSignal<ArApStatusFilters>(defaultFilters());
  const [page, setPage] = createSignal(1);
  const [pageSize, setPageSize] = createSignal(50);

  const report = useArApStatusReport(() => ({
    filters: submitted(),
    page: page(),
    pageSize: pageSize(),
    sort: "partner_name",
    order: "asc",
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
  };

  const reset = () => {
    const next = defaultFilters();
    setDraft(next);
    setSubmitted(next);
    setPage(1);
  };

  const totalPages = () => Math.max(1, Math.ceil((report.data?.total ?? 0) / pageSize()));
  let reportBodyEl: HTMLDivElement | undefined;

  return (
    <FinanceLayout>
      <CollapsibleFilterPanel
        title="AR/AP Status"
        description="Combined receivable and payable position as-of a single date — defaults to today, then Search (F8)."
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
        <div class="flex flex-wrap gap-2">
          <For each={TYPE_TABS}>
            {(tab) => (
              <button
                type="button"
                class={`rounded-lg px-3 py-1.5 text-sm ${draft().status_type === tab.value ? "bg-brand-600 text-white" : "border border-stroke text-text-secondary"}`}
                onClick={() => setDraft((prev) => ({ ...prev, status_type: tab.value }))}
              >
                {tab.label}
              </button>
            )}
          </For>
        </div>
        <div class="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="As-of date">
            <input type="date" class={inputClass} value={draft().as_of} onInput={(e) => setDraft((prev) => ({ ...prev, as_of: e.currentTarget.value }))} />
          </Field>
        </div>
      </CollapsibleFilterPanel>

      <section class="mt-6 rounded-xl border border-stroke bg-white shadow-sm">
        <div class="flex flex-wrap items-center justify-end gap-2 border-b border-stroke px-5 py-3">
          <GridExportButtons
            title="AR/AP Status"
            filename="ar-ap-status"
            columns={[]}
            rows={() => []}
            scrapeRoot={() => reportBodyEl}
          />
        </div>
        <div class="overflow-x-auto" ref={(el) => (reportBodyEl = el)}>
          <table class="erp-grid min-w-full text-left text-sm">
            <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
              <tr>
                <th class="px-3 py-2">Partner</th>
                <th class="px-3 py-2">Kind</th>
                <th class="px-3 py-2 text-right">A/R Balance</th>
                <th class="px-3 py-2 text-right">A/P Balance</th>
                <th class="px-3 py-2 text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              <For each={report.data?.rows ?? []}>
                {(row) => (
                  <tr class="border-t border-stroke/60">
                    <td class="px-3 py-2">{row.partner_name}</td>
                    <td class="px-3 py-2">{row.partner_kind}</td>
                    <td class="px-3 py-2 text-right">{formatPeso(row.ar_balance)}</td>
                    <td class="px-3 py-2 text-right">{formatPeso(row.ap_balance)}</td>
                    <td class="px-3 py-2 text-right">{formatPeso(row.net_balance)}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-3 border-t border-stroke px-5 py-3 text-sm">
          <span>Page {page()} / {totalPages()}</span>
          <div class="flex gap-2">
            <PageSizeSelect value={pageSize()} onChange={(n) => { setPageSize(n); setPage(1); }} />
<button type="button" class="rounded border border-stroke px-3 py-1 disabled:opacity-50" disabled={page() <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
            <button type="button" class="rounded border border-stroke px-3 py-1 disabled:opacity-50" disabled={page() >= totalPages()} onClick={() => setPage((p) => p + 1)}>Next</button>
            <button type="button" class="rounded border border-stroke px-3 py-1" onClick={() => void downloadReportCsv(arApStatusExportUrl(submitted()), "ar-ap-status.csv")}>Export CSV</button>
          </div>
        </div>
      </section>
    </FinanceLayout>
  );
}
