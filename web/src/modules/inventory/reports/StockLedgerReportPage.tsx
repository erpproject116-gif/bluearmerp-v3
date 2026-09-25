import { createSignal, For, onMount, Show } from "solid-js";
import { A, useSearchParams } from "@solidjs/router";
import { defaultReportDateRange, ReportPageLayout } from "../../../shared/reports/ReportPageLayout";
import { downloadReportCsv } from "../../../shared/reports/downloadReportCsv";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { inventoryRefLink } from "../../../shared/inventoryRefLink";
import {
  stockLedgerExportUrl,
  useStockLedgerReport,
  type StockLedgerFilters,
} from "../../../shared/reports/useModuleReports";

function defaultFilters(): StockLedgerFilters {
  return { ...defaultReportDateRange(), q: "" };
}

export default function StockLedgerReportPage() {
  const [searchParams] = useSearchParams();
  const [draft, setDraft] = createSignal<StockLedgerFilters>(defaultFilters());
  const [applied, setApplied] = createSignal<StockLedgerFilters>(defaultFilters());
  const [submitted, setSubmitted] = createSignal(true);
  const [runId, setRunId] = createSignal(0);
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const [pageSize, setPageSize] = createSignal(50);

  const report = useStockLedgerReport(() => ({
    filters: applied(),
    page: page(),
    pageSize: pageSize(),
    sort: "created_at",
    order: "desc",
    enabled: submitted(),
    runId: runId(),
  }));

  const search = () => {
    setApplied({ ...draft() });
    setSubmitted(true);
    setPage(1);
    setRunId((n) => n + 1);
    setGeneratedAt(new Date());
  };

  onMount(() => {
    const one = (key: string) => {
      const v = searchParams[key];
      return typeof v === "string" ? v.trim() : "";
    };
    const itemId = Number(one("item_id"));
    const locationId = Number(one("location_id"));
    const q = one("q");
    const dateFrom = one("date_from");
    const dateTo = one("date_to");
    const fromUrl: Partial<StockLedgerFilters> = {};
    if (Number.isFinite(itemId) && itemId > 0) fromUrl.item_id = itemId;
    if (Number.isFinite(locationId) && locationId > 0) fromUrl.location_id = locationId;
    if (q) fromUrl.q = q;
    if (dateFrom) fromUrl.date_from = dateFrom;
    if (dateTo) fromUrl.date_to = dateTo;
    if (Object.keys(fromUrl).length > 0) {
      setDraft((prev) => ({ ...prev, ...fromUrl }));
      setApplied((prev) => ({ ...prev, ...fromUrl }));
      setSubmitted(true);
      setRunId((n) => n + 1);
      setGeneratedAt(new Date());
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F8") {
        e.preventDefault();
        search();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const patch = (p: Partial<StockLedgerFilters>) => setDraft((prev) => ({ ...prev, ...p }));

  const totalPages = () => Math.max(1, Math.ceil((report.data?.total ?? 0) / pageSize()));

  return (
    <ReportPageLayout
      title="Stock Ledger"
      description="Movement detail with running balance by item and location — Search (F8)."
      dateFrom={() => draft().date_from ?? ""}
      dateTo={() => draft().date_to ?? ""}
      onDateFromChange={(v) => patch({ date_from: v })}
      onDateToChange={(v) => patch({ date_to: v })}
      submitted={submitted()}
      loading={report.isFetching}
      generatedAt={generatedAt()}
      page={page()}
      totalPages={totalPages()}
      onPageChange={setPage}
      pageSize={pageSize()} onPageSizeChange={setPageSize}
      onSearch={search}
      onReset={() => {
        const next = defaultFilters();
        setDraft(next);
        setApplied(next);
        setSubmitted(true);
        setPage(1);
        setRunId((n) => n + 1);
        setGeneratedAt(new Date());
      }}
      onExportCsv={() => void downloadReportCsv(stockLedgerExportUrl(applied()), "stock-ledger.csv")}
      filterExtra={
        <div class="mt-4 grid gap-4 md:grid-cols-3">
          <Field label="Item keyword">
            <input class={inputClass} value={draft().q ?? ""} onInput={(e) => patch({ q: e.currentTarget.value })} />
          </Field>
          <Field label="Item ID">
            <input
              type="number"
              class={inputClass}
              value={draft().item_id ?? ""}
              onInput={(e) => patch({ item_id: e.currentTarget.value ? Number(e.currentTarget.value) : undefined })}
            />
          </Field>
          <Field label="Location ID">
            <input
              type="number"
              class={inputClass}
              value={draft().location_id ?? ""}
              onInput={(e) =>
                patch({ location_id: e.currentTarget.value ? Number(e.currentTarget.value) : undefined })
              }
            />
          </Field>
        </div>
      }
    >
      <table class="erp-grid min-w-full text-left text-sm">
        <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
          <tr>
            <th class="px-3 py-2">Date</th>
            <th class="px-3 py-2">Item</th>
            <th class="px-3 py-2">Location</th>
            <th class="px-3 py-2 text-right">Qty Delta</th>
            <th class="px-3 py-2 text-right">Balance</th>
            <th class="px-3 py-2">Type</th>
            <th class="px-3 py-2">Reference</th>
            <th class="px-3 py-2">Reason</th>
          </tr>
        </thead>
        <tbody>
          <For each={report.data?.rows ?? []}>
            {(row) => {
              const ref = () => inventoryRefLink(row.ref_type, row.ref_id);
              return (
                <tr class="border-t border-stroke/60">
                  <td class="px-3 py-2">{row.created_at}</td>
                  <td class="px-3 py-2">
                    {row.item_code} — {row.item_name}
                  </td>
                  <td class="px-3 py-2">{row.location_name}</td>
                  <td class="px-3 py-2 text-right">{row.qty_delta}</td>
                  <td class="px-3 py-2 text-right">{row.running_balance}</td>
                  <td class="px-3 py-2">{row.movement_type}</td>
                  <td class="px-3 py-2">
                    <Show when={ref().href} fallback={ref().label}>
                      <A href={ref().href!} class="text-brand-600 hover:underline">
                        {ref().label}
                      </A>
                    </Show>
                  </td>
                  <td class="px-3 py-2">{row.reason ?? ""}</td>
                </tr>
              );
            }}
          </For>
        </tbody>
      </table>
      <Show when={submitted() && (report.data?.rows?.length ?? 0) === 0 && !report.isFetching}>
        <p class="px-5 py-8 text-center text-sm text-text-secondary">No movements in this date range.</p>
      </Show>
    </ReportPageLayout>
  );
}
