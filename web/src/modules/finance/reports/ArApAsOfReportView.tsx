import { createSignal, For, onMount, Show } from "solid-js";
import { formatPeso } from "../../../shared/money";
import { downloadReportCsv } from "../../../shared/reports/downloadReportCsv";
import {
  arApStatusExportUrl,
  useArApStatusReport,
  type ArApStatusFilters,
  type ArApStatusRow,
} from "../../../shared/reports/useModuleReports";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";

type Mode = "receivable" | "payable";

type Props = {
  mode: Mode;
  title: string;
  subtitle: string;
};

function defaultFilters(mode: Mode): ArApStatusFilters {
  return { as_of: new Date().toISOString().slice(0, 10), status_type: mode };
}

export function ArApAsOfReportView(props: Props) {
  const [draft, setDraft] = createSignal<ArApStatusFilters>(defaultFilters(props.mode));
  const [submitted, setSubmitted] = createSignal<ArApStatusFilters | null>(null);
  const [page, setPage] = createSignal(1);
  const pageSize = 50;

  const report = useArApStatusReport(() => ({
    filters: submitted() ?? defaultFilters(props.mode),
    page: page(),
    pageSize,
    sort: "partner_name",
    order: "asc",
    enabled: submitted() !== null,
  }));

  onMount(() => {
    search();
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
    setSubmitted({ ...draft(), status_type: props.mode });
    setPage(1);
  };

  const reset = () => {
    setDraft(defaultFilters(props.mode));
    setSubmitted(null);
    setPage(1);
  };

  const totalPages = () => Math.max(1, Math.ceil((report.data?.total ?? 0) / pageSize));
  const balance = (row: ArApStatusRow) => (props.mode === "receivable" ? row.ar_balance : row.ap_balance);

  const totalBalance = () =>
    (report.data?.rows ?? []).reduce((sum, row) => sum + balance(row), 0);

  return (
    <div class="space-y-6">
      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <h2 class="text-lg font-semibold text-text-primary">{props.title}</h2>
        <p class="mt-1 text-sm text-text-secondary">
          {props.mode === "receivable"
            ? "Open customer balances as of the date below. Balances come from Sales minus Official Receipt applications (CoA invoice mapping is optional for this report)."
            : "Open vendor balances as of the date below. Balances come from Purchases minus Payment Voucher applications."}
        </p>
        <div class="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="As-of date">
            <input
              type="date"
              class={inputClass}
              value={draft().as_of}
              onInput={(e) => setDraft((prev) => ({ ...prev, as_of: e.currentTarget.value }))}
            />
          </Field>
        </div>
        <div class="mt-4 flex gap-2">
          <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white" onClick={search}>
            Search (F8)
          </button>
          <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={reset}>
            Reset
          </button>
        </div>
      </section>

      <Show when={submitted()}>
        <section class="mt-6 rounded-xl border border-stroke bg-white shadow-sm">
          <div class="border-b border-stroke px-5 py-3 text-sm text-text-secondary">
            Open {props.mode === "receivable" ? "receivable" : "payable"} balance as of {submitted()!.as_of}
          </div>
          <div class="overflow-x-auto">
            <table class="erp-grid min-w-full text-left text-sm">
              <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
                <tr>
                  <th class="px-3 py-2">{props.mode === "receivable" ? "Customer" : "Vendor"}</th>
                  <th class="px-3 py-2">Kind</th>
                  <th class="px-3 py-2 text-right">Open balance</th>
                </tr>
              </thead>
              <tbody>
                <For each={report.data?.rows ?? []}>
                  {(row) => (
                    <tr class="border-t border-stroke/60">
                      <td class="px-3 py-2">{row.partner_name}</td>
                      <td class="px-3 py-2">{row.partner_kind}</td>
                      <td class="px-3 py-2 text-right">{formatPeso(balance(row))}</td>
                    </tr>
                  )}
                </For>
              </tbody>
              <tfoot>
                <tr class="border-t border-stroke bg-slate-50 font-semibold">
                  <td class="px-3 py-2" colSpan={2}>
                    Total ({report.data?.total ?? 0} partners)
                  </td>
                  <td class="px-3 py-2 text-right">{formatPeso(totalBalance())}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-3 border-t border-stroke px-5 py-3 text-sm">
            <span>
              Page {page()} / {totalPages()}
            </span>
            <div class="flex gap-2">
              <button
                type="button"
                class="rounded border border-stroke px-3 py-1 disabled:opacity-50"
                disabled={page() <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Prev
              </button>
              <button
                type="button"
                class="rounded border border-stroke px-3 py-1 disabled:opacity-50"
                disabled={page() >= totalPages()}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
              <button
                type="button"
                class="rounded border border-stroke px-3 py-1"
                onClick={() =>
                  submitted() &&
                  void downloadReportCsv(
                    arApStatusExportUrl({ ...submitted()!, status_type: props.mode }),
                    `${props.mode}-status.csv`,
                  )
                }
              >
                Export CSV
              </button>
            </div>
          </div>
        </section>
      </Show>
    </div>
  );
}
