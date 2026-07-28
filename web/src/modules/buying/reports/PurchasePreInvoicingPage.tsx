import { createSignal, For, onMount, Show } from "solid-js";
import { formatPeso } from "../../../shared/money";
import { DateInput } from "../../../shared/DateInput";
import { Field } from "../../../shared/SpreadsheetGrid";
import { downloadApiFile } from "../../../shared/reports/downloadReportCsv";
import { usePurchasePreInvoicingReport } from "../../../shared/usePurchasePreInvoicingReport";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function defaultFilters() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  return { date_from: from, date_to: todayISO(), as_of: "" };
}

export default function PurchasePreInvoicingPage() {
  const [draftFilters, setDraftFilters] = createSignal(defaultFilters());
  const [submittedFilters, setSubmittedFilters] = createSignal<ReturnType<typeof defaultFilters> | null>(null);
  const [page, setPage] = createSignal(1);
  const pageSize = 50;

  const report = usePurchasePreInvoicingReport(() => ({
    filters: submittedFilters() ?? defaultFilters(),
    page: page(),
    pageSize,
    enabled: submittedFilters() !== null,
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
    setSubmittedFilters({ ...draftFilters() });
    setPage(1);
  };

  const reset = () => {
    setDraftFilters(defaultFilters());
    setSubmittedFilters(null);
    setPage(1);
  };

  const exportUrl = () => {
    const f = submittedFilters();
    if (!f) return "";
    const qs = new URLSearchParams();
    if (f.as_of) qs.set("as_of", f.as_of);
    else {
      qs.set("date_from", f.date_from);
      qs.set("date_to", f.date_to);
    }
    return `/api/v1/buying/reports/pre-invoicing/export?${qs}`;
  };

  const downloadCsv = async () => {
    await downloadApiFile(exportUrl(), "purchase-pre-invoicing.csv");
  };

  const totalPages = () => Math.max(1, Math.ceil((report.data?.total ?? 0) / pageSize));

  return (
    <div class="space-y-6 p-4">
      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <h2 class="text-lg font-semibold">Pre-Invoicing Status (Purchases)</h2>
        <p class="text-sm text-text-secondary">Posted goods receipts with balance not yet on a supplier invoice.</p>
        <div class="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Date from">
            <DateInput value={draftFilters().date_from} onInput={(e) => setDraftFilters((f) => ({ ...f, date_from: e.currentTarget.value, as_of: "" }))} />
          </Field>
          <Field label="Date to">
            <DateInput value={draftFilters().date_to} onInput={(e) => setDraftFilters((f) => ({ ...f, date_to: e.currentTarget.value, as_of: "" }))} />
          </Field>
          <Field label="Or as-of date">
            <DateInput value={draftFilters().as_of} onInput={(e) => setDraftFilters((f) => ({ ...f, as_of: e.currentTarget.value }))} />
          </Field>
        </div>
        <div class="mt-4 flex gap-2">
          <button type="button" class="rounded bg-brand-600 px-4 py-2 text-sm text-white" onClick={search}>
            Search (F8)
          </button>
          <button type="button" class="rounded border border-stroke px-4 py-2 text-sm" onClick={reset}>
            Reset
          </button>
          <Show when={submittedFilters()}>
            <button type="button" class="rounded border border-stroke px-4 py-2 text-sm" onClick={() => void downloadCsv()}>
              Excel
            </button>
          </Show>
        </div>
      </section>

      <Show when={submittedFilters()}>
        <section class="rounded-xl border border-stroke bg-white shadow-sm">
          <div class="border-b border-stroke px-5 py-3 text-sm text-text-secondary">
            Total balance qty: {report.data?.summary.total_qty ?? 0} · Amount: {formatPeso(report.data?.summary.total_amount ?? 0)}
          </div>
          <div class="overflow-x-auto">
            <table class="erp-grid min-w-full text-sm">
              <thead class="bg-brand-50 text-xs uppercase text-brand-700">
                <tr>
                  <th class="px-3 py-2">GR Date</th>
                  <th class="px-3 py-2">PO No</th>
                  <th class="px-3 py-2">Vendor</th>
                  <th class="px-3 py-2">Item</th>
                  <th class="px-3 py-2 text-right">Balance Qty</th>
                  <th class="px-3 py-2 text-right">Balance Amount</th>
                </tr>
              </thead>
              <tbody>
                <For each={report.data?.rows ?? []}>
                  {(row) => (
                    <tr class="border-b border-stroke/60">
                      <td class="px-3 py-2">{row.date_no_display}</td>
                      <td class="px-3 py-2">{row.purchase_order_no}</td>
                      <td class="px-3 py-2">{row.vendor_name}</td>
                      <td class="px-3 py-2">
                        {row.item_code} — {row.item_name}
                      </td>
                      <td class="px-3 py-2 text-right">{row.balance_qty}</td>
                      <td class="px-3 py-2 text-right">{formatPeso(row.balance_amount)}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
          <div class="flex justify-between border-t border-stroke px-5 py-3 text-sm">
            <span>
              Page {page()} of {totalPages()}
            </span>
            <div class="flex gap-2">
              <button type="button" class="rounded border px-3 py-1" disabled={page() <= 1} onClick={() => setPage((p) => p - 1)}>
                Prev
              </button>
              <button type="button" class="rounded border px-3 py-1" disabled={page() >= totalPages()} onClick={() => setPage((p) => p + 1)}>
                Next
              </button>
            </div>
          </div>
        </section>
      </Show>
    </div>
  );
}
