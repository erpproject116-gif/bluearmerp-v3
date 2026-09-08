import { createSignal, For, onMount, Show } from "solid-js";
import { ReportPageLayout, defaultReportDateRange } from "../../../shared/reports/ReportPageLayout";
import { downloadReportCsv } from "../../../shared/reports/downloadReportCsv";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { invBookExportUrl, useInvBookReport, type InvBookFilters } from "../../../shared/reports/useModuleReports";
import { formatPeso } from "../../../shared/money";
import { InvBookFamilyNav } from "../InvBookFamilyNav";
import { InvBookLedgerModal, type InvBookLedgerTarget } from "./InvBookLedgerModal";

function defaultFilters(): InvBookFilters {
  return { ...defaultReportDateRange(), q: "" };
}

export default function InvBookReportPage() {
  const [draft, setDraft] = createSignal<InvBookFilters>(defaultFilters());
  const [applied, setApplied] = createSignal<InvBookFilters>(defaultFilters());
  const [submitted, setSubmitted] = createSignal(true);
  const [runId, setRunId] = createSignal(0);
  const [page, setPage] = createSignal(1);
  const [generatedAt, setGeneratedAt] = createSignal(new Date());
  const [ledgerRow, setLedgerRow] = createSignal<InvBookLedgerTarget | null>(null);
  const pageSize = 50;

  const report = useInvBookReport(() => ({
    filters: applied(),
    page: page(),
    pageSize,
    sort: "item_code",
    order: "asc",
    enabled: submitted(),
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
    setApplied({ ...draft() });
    setSubmitted(true);
    setPage(1);
    setRunId((n) => n + 1);
    setGeneratedAt(new Date());
  };

  const patch = (p: Partial<InvBookFilters>) => setDraft((prev) => ({ ...prev, ...p }));

  const openLedger = (row: InvBookLedgerTarget) => setLedgerRow(row);

  const totalPages = () => Math.max(1, Math.ceil((report.data?.total ?? 0) / pageSize));

  return (
    <>
      <InvBookFamilyNav active="item" />
      <ReportPageLayout
        title="Item Inv. Book"
        description="Opening, receipt, issue, and closing qty by item and location — click a row to view that item’s Stock Ledger."
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
        onExportCsv={() => void downloadReportCsv(invBookExportUrl(applied()), "inv-book.csv")}
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
              <th class="px-3 py-2">Item</th>
              <th class="px-3 py-2">Location</th>
              <th class="px-3 py-2 text-right">Opening</th>
              <th class="px-3 py-2 text-right">Receipt</th>
              <th class="px-3 py-2 text-right">Issue</th>
              <th class="px-3 py-2 text-right">Closing</th>
              <th class="px-3 py-2 text-right">Purchase Price</th>
              <th class="px-3 py-2 text-right">Sales Price</th>
              <th class="px-3 py-2 text-right">VIP Price</th>
            </tr>
          </thead>
          <tbody>
            <For each={report.data?.rows ?? []}>
              {(row) => (
                <tr
                  class="cursor-pointer border-t border-stroke/60 hover:bg-brand-50/40"
                  tabindex={0}
                  aria-label={`Open stock ledger for ${row.item_code} at ${row.location_name}`}
                  onClick={() => openLedger(row)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openLedger(row);
                    }
                  }}
                >
                  <td class="px-3 py-2 font-medium text-brand-700">
                    {row.item_code} — {row.item_name}
                  </td>
                  <td class="px-3 py-2">{row.location_name}</td>
                  <td class="px-3 py-2 text-right">{row.opening_qty}</td>
                  <td class="px-3 py-2 text-right">{row.receipt_qty}</td>
                  <td class="px-3 py-2 text-right">{row.issue_qty}</td>
                  <td class="px-3 py-2 text-right font-medium text-brand-700">{row.closing_qty}</td>
                  <td class="px-3 py-2 text-right">{formatPeso(row.purchase_price)}</td>
                  <td class="px-3 py-2 text-right">{formatPeso(row.sales_price)}</td>
                  <td class="px-3 py-2 text-right">{formatPeso(row.vip_price)}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
        <Show when={submitted() && (report.data?.rows?.length ?? 0) === 0 && !report.isFetching}>
          <p class="px-5 py-8 text-center text-sm text-text-secondary">
            No inventory book rows for this period. Try a wider date range, or post stock movements via{" "}
            <a class="text-brand-600 hover:underline" href="/app/inventory/stock-entries">
              Stock Entries
            </a>
            .
          </p>
        </Show>
        <Show when={report.isError}>
          <p class="px-5 py-4 text-center text-sm text-red-600">
            {(report.error as Error)?.message ?? "Failed to load inv. book."}
          </p>
        </Show>
      </ReportPageLayout>

      <InvBookLedgerModal
        open={ledgerRow() != null}
        row={ledgerRow()}
        period={applied()}
        onClose={() => setLedgerRow(null)}
      />
    </>
  );
}
