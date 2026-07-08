import { createSignal, For, Show } from "solid-js";
import { formatPeso } from "../../../shared/money";
import { getAccessToken } from "../../../shared/api";
import { DateInput } from "../../../shared/DateInput";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import type { PartnerBookType } from "./partnerBookFilters";
import { defaultPartnerBookFilters, formatDisplayDate, partnerBookExportUrl } from "./partnerBookFilters";
import { usePartnerBookReport } from "../../../shared/usePartnerBookReport";
import { FinanceLayout } from "../FinanceLayout";

type Props = { bookType: PartnerBookType };

export default function CustomerVendorBookPage(props: Props) {
  const title = () => (props.bookType === "ar" ? "Customer/Vendor Book I (AR)" : "Customer/Vendor Book I (AP)");
  const [draftFilters, setDraftFilters] = createSignal(defaultPartnerBookFilters(props.bookType));
  const [submittedFilters, setSubmittedFilters] = createSignal<ReturnType<typeof defaultPartnerBookFilters> | null>(null);
  const [page, setPage] = createSignal(1);
  const pageSize = 50;

  const report = usePartnerBookReport(() => ({
    filters: submittedFilters() ?? defaultPartnerBookFilters(props.bookType),
    page: page(),
    pageSize,
    enabled: submittedFilters() !== null,
  }));

  const search = () => {
    setSubmittedFilters({ ...draftFilters() });
    setPage(1);
  };

  const reset = () => {
    setDraftFilters(defaultPartnerBookFilters(props.bookType));
    setSubmittedFilters(null);
    setPage(1);
  };

  const downloadCsv = async () => {
    const f = submittedFilters();
    if (!f) return;
    const token = await getAccessToken();
    const res = await fetch(partnerBookExportUrl(f), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `customer-vendor-book-${f.book_type}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = () => Math.max(1, Math.ceil((report.data?.total ?? 0) / pageSize));

  const rowsWithBalance = () => {
    let running = 0;
    return (report.data?.rows ?? []).map((r) => {
      running += r.debit - r.credit;
      return { ...r, balance: running };
    });
  };

  return (
    <FinanceLayout>
      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <h2 class="text-lg font-semibold text-text-primary">{title()}</h2>
        <p class="mt-1 text-sm text-text-secondary">By slip + details — set date range, then Search (F8).</p>
        <div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Date from">
            <DateInput value={draftFilters().date_from} onInput={(e) => setDraftFilters((f) => ({ ...f, date_from: e.currentTarget.value }))} />
          </Field>
          <Field label="Date to">
            <DateInput value={draftFilters().date_to} onInput={(e) => setDraftFilters((f) => ({ ...f, date_to: e.currentTarget.value }))} />
          </Field>
          <Field label="Partner ID (optional)">
            <input
              class={inputClass}
              type="number"
              value={draftFilters().partner_id ?? ""}
              onInput={(e) => {
                const v = e.currentTarget.value;
                setDraftFilters((f) => ({ ...f, partner_id: v ? Number(v) : null }));
              }}
            />
          </Field>
        </div>
        <div class="mt-4 flex flex-wrap gap-2">
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
        <section class="mt-6 rounded-xl border border-stroke bg-white shadow-sm">
          <div class="border-b border-stroke px-5 py-4 text-center">
            <h3 class="text-xl font-bold">{title()}</h3>
            <p class="text-sm text-text-secondary">
              {formatDisplayDate(submittedFilters()!.date_from)} ~ {formatDisplayDate(submittedFilters()!.date_to)}
            </p>
          </div>
          <div class="overflow-x-auto">
            <table class="erp-grid min-w-full text-sm">
              <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
                <tr>
                  <th class="px-3 py-2">Date</th>
                  <th class="px-3 py-2">Slip Type</th>
                  <th class="px-3 py-2">Slip No</th>
                  <th class="px-3 py-2">Partner</th>
                  <th class="px-3 py-2">Description</th>
                  <th class="px-3 py-2 text-right">Debit</th>
                  <th class="px-3 py-2 text-right">Credit</th>
                  <th class="px-3 py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                <Show when={report.isFetching}>
                  <tr>
                    <td colSpan={8} class="px-3 py-6 text-center text-text-secondary">
                      Loading…
                    </td>
                  </tr>
                </Show>
                <For each={rowsWithBalance()}>
                  {(row) => (
                    <tr class="border-b border-stroke/60">
                      <td class="px-3 py-2">{formatDisplayDate(row.txn_date)}</td>
                      <td class="px-3 py-2">{row.slip_type}</td>
                      <td class="px-3 py-2">{row.date_no_display || row.slip_no}</td>
                      <td class="px-3 py-2">{row.partner_name}</td>
                      <td class="px-3 py-2">{row.description}</td>
                      <td class="px-3 py-2 text-right">{row.debit ? formatPeso(row.debit) : ""}</td>
                      <td class="px-3 py-2 text-right">{row.credit ? formatPeso(row.credit) : ""}</td>
                      <td class="px-3 py-2 text-right">{formatPeso(row.balance)}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
          <div class="flex items-center justify-between border-t border-stroke px-5 py-3 text-sm">
            <span>
              Page {page()} of {totalPages()}
            </span>
            <div class="flex gap-2">
              <button type="button" class="rounded border border-stroke px-3 py-1" disabled={page() <= 1} onClick={() => setPage((p) => p - 1)}>
                Prev
              </button>
              <button type="button" class="rounded border border-stroke px-3 py-1" disabled={page() >= totalPages()} onClick={() => setPage((p) => p + 1)}>
                Next
              </button>
            </div>
          </div>
        </section>
      </Show>
    </FinanceLayout>
  );
}
