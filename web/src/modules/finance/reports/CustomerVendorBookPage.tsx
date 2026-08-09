import { A } from "@solidjs/router";
import { createSignal, For, onMount, Show } from "solid-js";
import { formatPeso } from "../../../shared/money";
import { getAccessToken } from "../../../shared/api";
import { DateInput } from "../../../shared/DateInput";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { GridExportButtons } from "../../../shared/gridExport";
import { CollapsibleFilterPanel } from "../../../shared/CollapsibleFilterPanel";
import type { PartnerBookType } from "./partnerBookFilters";
import { defaultPartnerBookFilters, formatDisplayDate, partnerBookExportUrl } from "./partnerBookFilters";
import { usePartnerBookReport } from "../../../shared/usePartnerBookReport";
import { FinanceLayout } from "../FinanceLayout";
import { InlineTip } from "../../../shared/inlineGuides";

type Props = { bookType: PartnerBookType };

function slipHref(docKind?: string, docId?: number): string | null {
  if (!docKind || !docId) return null;
  switch (docKind) {
    case "sales":
      return `/app/sales/sales?openId=${docId}`;
    case "supplier_invoice":
      return `/app/purchases/purchase-receive?openId=${docId}`;
    case "official_receipt":
      return `/app/finance/official-receipts?openId=${docId}`;
    case "payment_voucher":
      return `/app/finance/payment-vouchers?openId=${docId}`;
    default:
      return null;
  }
}

export default function CustomerVendorBookPage(props: Props) {
  const title = () => (props.bookType === "ar" ? "Customer/Vendor Book I (AR)" : "Customer/Vendor Book I (AP)");
  const [draftFilters, setDraftFilters] = createSignal(defaultPartnerBookFilters(props.bookType));
  const [submittedFilters, setSubmittedFilters] = createSignal(defaultPartnerBookFilters(props.bookType));
  const [page, setPage] = createSignal(1);
  const pageSize = 50;

  const report = usePartnerBookReport(() => ({
    filters: submittedFilters(),
    page: page(),
    pageSize,
    enabled: true,
  }));

  const search = () => {
    setSubmittedFilters({ ...draftFilters() });
    setPage(1);
  };

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

  const reset = () => {
    const next = defaultPartnerBookFilters(props.bookType);
    setDraftFilters(next);
    setSubmittedFilters(next);
    setPage(1);
  };

  const downloadCsv = async () => {
    const f = submittedFilters();
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
      <CollapsibleFilterPanel
        title={title()}
        description={
          props.bookType === "ar"
            ? "Customer ledger from Sales (debit) and Official Receipt applications (credit). Defaults to the last 90 days — expand filters to adjust, then Search (F8)."
            : "Vendor ledger from Purchases / supplier invoices (credit) and Payment Voucher applications (debit). Defaults to the last 90 days — expand filters to adjust, then Search (F8)."
        }
        actions={
          <>
            <button type="button" class="rounded bg-brand-600 px-4 py-2 text-sm text-white" onClick={search}>
              Search (F8)
            </button>
            <button type="button" class="rounded border border-stroke px-4 py-2 text-sm" onClick={reset}>
              Reset
            </button>
            <GridExportButtons
                title={title()}
                filename={`customer-vendor-book-${props.bookType}`}
                columns={[
                  { key: "txn_date", header: "Date", value: (r) => String(r.txn_date ?? "") },
                  { key: "slip_type", header: "Slip Type", value: (r) => String(r.slip_type ?? "") },
                  { key: "slip_no", header: "Slip No", value: (r) => String(r.date_no_display || r.slip_no || "") },
                  { key: "partner_name", header: "Partner", value: (r) => String(r.partner_name ?? "") },
                  { key: "description", header: "Description", value: (r) => String(r.description ?? "") },
                  { key: "debit", header: "Debit", value: (r) => Number(r.debit ?? 0) },
                  { key: "credit", header: "Credit", value: (r) => Number(r.credit ?? 0) },
                  { key: "balance", header: "Balance", value: (r) => Number(r.balance ?? 0) },
                ]}
                rows={() => rowsWithBalance() as unknown as Record<string, unknown>[]}
              />
            <button type="button" class="rounded border border-stroke px-4 py-2 text-sm" onClick={() => void downloadCsv()}>
              API CSV
            </button>
          </>
        }
      >
        <InlineTip class="rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-2 text-xs text-slate-700">
          {props.bookType === "ar" ? (
            <p>
              Rows come from <span class="font-medium">Sales</span> and applied{" "}
              <span class="font-medium">Official Receipts</span>.
            </p>
          ) : (
            <p>
              Rows come from <span class="font-medium">Purchases</span> and applied{" "}
              <span class="font-medium">Payment Vouchers</span>.
            </p>
          )}
        </InlineTip>
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
      </CollapsibleFilterPanel>

      <section class="mt-6 rounded-xl border border-stroke bg-white shadow-sm">
          <div class="border-b border-stroke px-5 py-4 text-center">
            <h3 class="text-xl font-bold">{title()}</h3>
            <p class="text-sm text-text-secondary">
              {formatDisplayDate(submittedFilters().date_from)} ~ {formatDisplayDate(submittedFilters().date_to)}
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
                <Show when={!report.isFetching && rowsWithBalance().length === 0}>
                  <tr>
                    <td colSpan={8} class="px-3 py-8 text-center text-sm text-text-secondary">
                      No slips in this date range.
                      {props.bookType === "ar"
                        ? " Create a Sales invoice first (any date in range), then search again."
                        : " Create a Purchase (supplier invoice) first, then search again."}
                    </td>
                  </tr>
                </Show>
                <For each={rowsWithBalance()}>
                  {(row) => {
                    const href = () => slipHref(row.doc_kind, row.doc_id);
                    return (
                      <tr class="border-b border-stroke/60 hover:bg-brand-50/40">
                        <td class="px-3 py-2">{formatDisplayDate(row.txn_date)}</td>
                        <td class="px-3 py-2">{row.slip_type}</td>
                        <td class="px-3 py-2">
                          <Show when={href()} fallback={<span>{row.date_no_display || row.slip_no}</span>}>
                            {(h) => (
                              <A href={h()} class="font-medium text-brand-600 underline-offset-2 hover:underline">
                                {row.date_no_display || row.slip_no}
                              </A>
                            )}
                          </Show>
                        </td>
                        <td class="px-3 py-2">{row.partner_name}</td>
                        <td class="px-3 py-2">{row.description}</td>
                        <td class="px-3 py-2 text-right">{row.debit ? formatPeso(row.debit) : ""}</td>
                        <td class="px-3 py-2 text-right">{row.credit ? formatPeso(row.credit) : ""}</td>
                        <td class="px-3 py-2 text-right">{formatPeso(row.balance)}</td>
                      </tr>
                    );
                  }}
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
    </FinanceLayout>
  );
}
