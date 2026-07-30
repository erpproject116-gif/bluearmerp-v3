import { createSignal, For } from "solid-js";
import { A } from "@solidjs/router";
import { defaultReportDateRange } from "../../../shared/reports/ReportPageLayout";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { downloadApiFile } from "../../../shared/reports/downloadReportCsv";

const BOOKS = [
  { id: "sales-journal", label: "Sales Journal" },
  { id: "purchase-journal", label: "Purchase Journal" },
  { id: "cash-receipts", label: "Cash Receipts" },
  { id: "cash-disbursements", label: "Cash Disbursements" },
  { id: "general-journal", label: "General Journal" },
  { id: "general-ledger", label: "General Ledger" },
] as const;

export default function BooksOfAccountsPage() {
  const defaults = defaultReportDateRange();
  const [book, setBook] = createSignal<(typeof BOOKS)[number]["id"]>("general-ledger");
  const [dateFrom, setDateFrom] = createSignal(defaults.date_from ?? "");
  const [dateTo, setDateTo] = createSignal(defaults.date_to ?? "");

  const qs = () => {
    const p = new URLSearchParams({ date_from: dateFrom(), date_to: dateTo() });
    return p.toString();
  };

  const open = async (format: "csv" | "html") => {
    const url = `/api/v1/finance/books/${book()}?${qs()}&format=${format}`;
    if (format === "csv") {
      await downloadApiFile(url, `${book()}.csv`);
    } else {
      window.open(url, "_blank");
    }
  };

  return (
    <div class="mx-auto max-w-2xl space-y-4 p-4">
      <div class="flex items-center gap-2 text-sm text-text-secondary">
        <A href="/app/finance/statutory" class="text-brand-600 hover:underline">
          Statutory hub
        </A>
        <span>/</span>
        <span>Books of accounts</span>
      </div>
      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <h2 class="text-lg font-semibold">Books of accounts</h2>
        <p class="mt-1 text-sm text-text-secondary">Posted journal lines filtered by book type and fiscal period. CSV for spreadsheets; HTML for print/PDF.</p>
        <div class="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Book">
            <select
              class={inputClass}
              value={book()}
              onChange={(e) => setBook(e.currentTarget.value as (typeof BOOKS)[number]["id"])}
            >
              <For each={BOOKS}>{(b) => <option value={b.id}>{b.label}</option>}</For>
            </select>
          </Field>
          <Field label="Period from">
            <input class={inputClass} type="date" value={dateFrom()} onInput={(e) => setDateFrom(e.currentTarget.value)} />
          </Field>
          <Field label="Period to">
            <input class={inputClass} type="date" value={dateTo()} onInput={(e) => setDateTo(e.currentTarget.value)} />
          </Field>
        </div>
        <div class="mt-4 flex flex-wrap gap-2">
          <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700" onClick={() => open("csv")}>
            Export CSV
          </button>
          <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm hover:bg-slate-50" onClick={() => open("html")}>
            Print preview (HTML)
          </button>
        </div>
      </section>
    </div>
  );
}
