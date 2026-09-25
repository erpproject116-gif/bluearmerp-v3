import { createSignal, For, onMount, Show } from "solid-js";
import { ReportPageLayout } from "../../../shared/reports/ReportPageLayout";
import { downloadReportCsv } from "../../../shared/reports/downloadReportCsv";
import { onHandExportUrl, useOnHandReport, type OnHandFilters } from "../../../shared/reports/useModuleReports";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { SAFETY_DOC_TYPES } from "../../../shared/itemMasterConstants";
import { ReportEmptyMessage } from "../../../shared/reports/ReportTableStates";

function defaultFilters(): OnHandFilters {
  return { as_of: new Date().toISOString().slice(0, 10), below_safety: false };
}

export default function OnHandReportPage() {
  const [draft, setDraft] = createSignal<OnHandFilters>(defaultFilters());
  const [submitted, setSubmitted] = createSignal<OnHandFilters | null>(null);
  const [runId, setRunId] = createSignal(0);
  const [page, setPage] = createSignal(1);
  const [pageSize, setPageSize] = createSignal(50);

  const report = useOnHandReport(() => ({
    filters: submitted() ?? defaultFilters(),
    page: page(),
    pageSize: pageSize(),
    sort: "item_code",
    order: "asc",
    enabled: submitted() !== null,
    runId: runId(),
  }));

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F8") {
        e.preventDefault();
        search();
      }
    };
    window.addEventListener("keydown", onKey);
    search();
    return () => window.removeEventListener("keydown", onKey);
  });

  const search = () => {
    setSubmitted({ ...draft() });
    setPage(1);
    setRunId((n) => n + 1);
  };

  const patch = (p: Partial<OnHandFilters>) => setDraft((prev) => ({ ...prev, ...p }));

  const totalPages = () => Math.max(1, Math.ceil((report.data?.total ?? 0) / pageSize()));

  return (
    <>
      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <h2 class="text-lg font-semibold text-text-primary">Inventory Balance (On Hand)</h2>
        <p class="text-sm text-text-secondary">As-of date, qty range, and below-safety filter — Search (F8).</p>
        <div class="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="As-of date">
            <input type="date" class={inputClass} value={draft().as_of ?? ""} onInput={(e) => patch({ as_of: e.currentTarget.value })} />
          </Field>
          <Field label="Min qty">
            <input type="number" class={inputClass} value={draft().min_qty ?? ""} onInput={(e) => patch({ min_qty: e.currentTarget.value ? Number(e.currentTarget.value) : undefined })} />
          </Field>
          <Field label="Max qty">
            <input type="number" class={inputClass} value={draft().max_qty ?? ""} onInput={(e) => patch({ max_qty: e.currentTarget.value ? Number(e.currentTarget.value) : undefined })} />
          </Field>
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft().below_safety ?? false} onChange={(e) => patch({ below_safety: e.currentTarget.checked })} />
            Below safety / reorder level only
          </label>
          <Field label="Safety threshold doc type">
            <select
              class={inputClass}
              value={draft().safety_doc_type ?? ""}
              onChange={(e) => patch({ safety_doc_type: e.currentTarget.value || undefined })}
            >
              <option value="">Default reorder level</option>
              {SAFETY_DOC_TYPES.map((d) => (
                <option value={d.key}>{d.label}</option>
              ))}
            </select>
          </Field>
        </div>
        <div class="mt-4 flex gap-2">
          <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white" onClick={search}>Search (F8)</button>
          <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={() => { setDraft(defaultFilters()); setSubmitted(null); }}>Reset</button>
        </div>
      </section>

      <ReportPageLayout
        title="Inventory Balance"
        showDateFilters={false}
        submitted={submitted() !== null}
        loading={report.isFetching}
        page={page()}
        totalPages={totalPages()}
        onPageChange={setPage}
      pageSize={pageSize()} onPageSizeChange={setPageSize}
        onSearch={search}
        onReset={() => setSubmitted(null)}
        onExportCsv={() => submitted() && void downloadReportCsv(onHandExportUrl(submitted()!), "inventory-on-hand.csv")}
      >
        <table class="erp-grid min-w-full text-left text-sm">
          <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
            <tr>
              <th class="px-3 py-2">Item</th>
              <th class="px-3 py-2">Location</th>
              <th class="px-3 py-2 text-right">On Hand</th>
              <th class="px-3 py-2 text-right">Reserved</th>
              <th class="px-3 py-2 text-right">Reorder</th>
              <th class="px-3 py-2">Below Safety</th>
            </tr>
          </thead>
          <tbody>
            <For each={report.data?.rows ?? []}>
              {(row) => (
                <tr class="border-t border-stroke/60">
                  <td class="px-3 py-2">{row.item_code} — {row.item_name}</td>
                  <td class="px-3 py-2">{row.location_name}</td>
                  <td class="px-3 py-2 text-right">{row.qty_on_hand}</td>
                  <td class="px-3 py-2 text-right">{row.qty_reserved}</td>
                  <td class="px-3 py-2 text-right">{row.reorder_level ?? "—"}</td>
                  <td class="px-3 py-2">{row.below_safety ? "Yes" : ""}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
        <Show when={submitted() && (report.data?.rows?.length ?? 0) === 0 && !report.isFetching}>
          <ReportEmptyMessage message="No on-hand balances found. Post a goods receipt or stock entry, then refresh. Open Stock Entries from Inventory if needed." />
        </Show>
        <Show when={report.isError}>
          <p class="px-5 py-4 text-center text-sm text-red-600">
            {(report.error as Error)?.message ?? "Failed to load on-hand report."}
          </p>
        </Show>
      </ReportPageLayout>
    </>
  );
}
