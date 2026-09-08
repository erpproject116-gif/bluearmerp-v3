import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { A } from "@solidjs/router";
import { Portal } from "solid-js/web";
import { inventoryRefLink } from "../../../shared/inventoryRefLink";
import { PageJumpControl } from "../../../shared/PageJumpControl";
import { ReportLoadingOverlay } from "../../../shared/reports/ReportLoadingOverlay";
import {
  useStockLedgerReport,
  type InvBookFilters,
  type InvBookRow,
  type StockLedgerFilters,
} from "../../../shared/reports/useModuleReports";

export type InvBookLedgerTarget = Pick<
  InvBookRow,
  "item_id" | "location_id" | "item_code" | "item_name" | "location_name"
>;

type Props = {
  open: boolean;
  row: InvBookLedgerTarget | null;
  period: InvBookFilters;
  onClose: () => void;
};

export function InvBookLedgerModal(props: Props) {
  const [page, setPage] = createSignal(1);
  const [runId, setRunId] = createSignal(0);
  const pageSize = 100;

  createEffect(() => {
    if (!props.open || !props.row) return;
    setPage(1);
    setRunId((n) => n + 1);
  });

  createEffect(() => {
    if (!props.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        props.onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  const filters = (): StockLedgerFilters => {
    const row = props.row;
    return {
      date_from: props.period.date_from,
      date_to: props.period.date_to,
      item_id: row?.item_id,
      location_id: row?.location_id,
    };
  };

  const report = useStockLedgerReport(() => ({
    filters: filters(),
    page: page(),
    pageSize,
    sort: "created_at",
    order: "desc",
    enabled: props.open && props.row != null,
    runId: runId(),
  }));

  const totalPages = () => Math.max(1, Math.ceil((report.data?.total ?? 0) / pageSize));
  const title = () => {
    const row = props.row;
    if (!row) return "Stock Ledger";
    return `${row.item_code} — ${row.item_name}`;
  };

  return (
    <Show when={props.open && props.row}>
      <Portal>
        <div
          class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-3 sm:p-6"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) props.onClose();
          }}
        >
          <div
            class="my-2 flex w-full max-w-7xl flex-col rounded-2xl border border-stroke bg-white shadow-xl"
            style={{ "max-height": "92vh" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="inv-book-ledger-modal-title"
          >
            <div class="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-stroke px-5 py-4">
              <div class="min-w-0">
                <h2 id="inv-book-ledger-modal-title" class="truncate text-lg font-semibold text-text-primary">
                  {title()}
                </h2>
                <p class="mt-0.5 text-sm text-text-secondary">
                  Stock Ledger · {props.row!.location_name}
                  <Show when={props.period.date_from || props.period.date_to}>
                    {" "}
                    · {props.period.date_from ?? "…"} → {props.period.date_to ?? "…"}
                  </Show>
                </p>
              </div>
              <button
                type="button"
                class="rounded-lg border border-stroke px-3 py-1.5 text-sm text-text-secondary hover:bg-slate-50"
                aria-label="Close stock ledger"
                onClick={() => props.onClose()}
              >
                Close
              </button>
            </div>

            <div class="min-h-0 flex-1 overflow-auto px-5 py-3">
              <ReportLoadingOverlay loading={report.isFetching}>
                <table class="erp-grid min-w-full text-left text-sm">
                  <thead class="sticky top-0 z-[1] bg-brand-50 text-xs font-semibold uppercase text-brand-700">
                    <tr>
                      <th class="px-3 py-2">Date</th>
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
                            <td class="px-3 py-2 whitespace-nowrap">{row.created_at}</td>
                            <td class="px-3 py-2 text-right">{row.qty_delta}</td>
                            <td class="px-3 py-2 text-right">{row.running_balance}</td>
                            <td class="px-3 py-2">{row.movement_type}</td>
                            <td class="px-3 py-2">
                              <Show when={ref().href} fallback={ref().label}>
                                <A href={ref().href!} class="text-brand-600 hover:underline" onClick={() => props.onClose()}>
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
                <Show when={(report.data?.rows?.length ?? 0) === 0 && !report.isFetching}>
                  <p class="px-2 py-8 text-center text-sm text-text-secondary">No movements in this date range.</p>
                </Show>
                <Show when={report.isError}>
                  <p class="px-2 py-4 text-center text-sm text-red-600">
                    {(report.error as Error)?.message ?? "Failed to load stock ledger."}
                  </p>
                </Show>
              </ReportLoadingOverlay>
            </div>

            <div class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-stroke px-5 py-3 text-sm">
              <span class="text-text-secondary">
                {report.data?.total ?? 0} movement{(report.data?.total ?? 0) === 1 ? "" : "s"}
              </span>
              <div class="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  class="rounded border border-stroke px-3 py-1 disabled:opacity-50"
                  disabled={page() <= 1 || report.isFetching}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </button>
                <PageJumpControl page={page()} totalPages={totalPages()} onPageChange={setPage} compact />
                <button
                  type="button"
                  class="rounded border border-stroke px-3 py-1 disabled:opacity-50"
                  disabled={page() >= totalPages() || report.isFetching}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
