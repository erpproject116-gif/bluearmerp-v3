import { PageSizeSelect } from "./pageSize";
import { For, Show, createSignal, onCleanup, type JSX } from "solid-js";
import { inputClass } from "./SpreadsheetGrid";
import { modalDismissClass } from "./Modal";
import { LoadingText } from "./LoadingText";

export type OpenMonitorFilters = {
  q: string;
  dateFrom: string;
  dateTo: string;
  docNo: string;
  partnerId: number | null;
  /** When true, partner filter is locked to the form header partner. */
  partnerLocked?: boolean;
  partnerLabel?: string;
};

export function defaultMonitorDates(days = 30): { dateFrom: string; dateTo: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { dateFrom: iso(from), dateTo: iso(to) };
}

export function buildOpenLineQuery(opts: {
  page: number;
  pageSize: number;
  onPageSizeChange?: (pageSize: number) => void;
  sort?: string;
  filters: OpenMonitorFilters;
}): string {
  const qs = new URLSearchParams({
    page: String(opts.page),
    pageSize: String(opts.pageSize),
    sort: opts.sort ?? "order_date",
    order: "desc",
  });
  if (opts.filters.q.trim()) qs.set("q", opts.filters.q.trim());
  if (opts.filters.dateFrom) qs.set("date_from", opts.filters.dateFrom);
  if (opts.filters.dateTo) qs.set("date_to", opts.filters.dateTo);
  if (opts.filters.docNo.trim()) qs.set("doc_no", opts.filters.docNo.trim());
  if (opts.filters.partnerId) qs.set("partner_id", String(opts.filters.partnerId));
  return qs.toString();
}

type Column = {
  key: string;
  header: string;
  class?: string;
  cell: (row: Record<string, unknown>) => JSX.Element | string | number | null | undefined;
};

type Props = {
  title: string;
  open: boolean;
  onClose: () => void;
  filters: OpenMonitorFilters;
  onFiltersChange: (next: OpenMonitorFilters) => void;
  loading?: boolean;
  error?: unknown;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  rows: Record<string, unknown>[];
  rowKey: (row: Record<string, unknown>) => number;
  selected: Set<number>;
  onToggleRow: (id: number) => void;
  onToggleAll: () => void;
  columns: Column[];
  onApply: () => void;
  applyLabel?: string;
  emptyHint?: string;
  /** Optional chips / filters under the title. */
  toolbar?: JSX.Element;
};

/** Open-transaction Load Slip monitor: search, date range, doc no, multi-select. */
export function OpenTransactionMonitor(props: Props) {
  const totalPages = () => Math.max(1, Math.ceil(props.total / props.pageSize));
  const patch = (partial: Partial<OpenMonitorFilters>) =>
    props.onFiltersChange({ ...props.filters, ...partial });

  // Local drafts so typing stays responsive; parent filter/query updates are debounced.
  // (Immediate value={props.filters.q} + refetch was resetting the field after each key.)
  // Show remounts on open, so drafts start empty — parents also clear filters on open.
  const [draftQ, setDraftQ] = createSignal("");
  const [draftDocNo, setDraftDocNo] = createSignal("");
  let qTimer: ReturnType<typeof setTimeout> | undefined;
  let docTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => {
    if (qTimer) clearTimeout(qTimer);
    if (docTimer) clearTimeout(docTimer);
  });

  const commitQ = (v: string) => {
    setDraftQ(v);
    if (qTimer) clearTimeout(qTimer);
    qTimer = setTimeout(() => {
      props.onFiltersChange({ ...props.filters, q: v });
      props.onPageChange(1);
    }, 300);
  };

  const commitDocNo = (v: string) => {
    setDraftDocNo(v);
    if (docTimer) clearTimeout(docTimer);
    docTimer = setTimeout(() => {
      props.onFiltersChange({ ...props.filters, docNo: v });
      props.onPageChange(1);
    }, 300);
  };

  const syncDraftsFromFilters = (next: OpenMonitorFilters) => {
    if (qTimer) clearTimeout(qTimer);
    if (docTimer) clearTimeout(docTimer);
    setDraftQ(next.q);
    setDraftDocNo(next.docNo);
  };

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:items-center">
        <div class="flex w-full max-w-6xl flex-col rounded-2xl border border-stroke bg-white shadow-xl" style={{ "max-height": "90vh" }}>
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-stroke px-5 py-3">
            <div>
              <h2 class="text-lg font-semibold text-text-primary">{props.title}</h2>
              <p class="text-xs text-text-secondary">
                Open load slips · {props.total} line{props.total === 1 ? "" : "s"} · select and Apply Residual Qty
              </p>
            </div>
            <button type="button" class={modalDismissClass} onClick={() => props.onClose()}>
              Close
            </button>
          </div>

          <Show when={props.toolbar}>
            <div class="border-b border-stroke px-5 py-2">{props.toolbar}</div>
          </Show>

          <div class="flex flex-wrap items-end gap-2 border-b border-stroke px-5 py-3">
            <label class="text-xs text-text-secondary">
              Search
              <input
                class={`${inputClass} mt-0.5 min-w-[12rem]`}
                placeholder="Customer, partner code, SO no, item…"
                value={draftQ()}
                onInput={(e) => commitQ(e.currentTarget.value)}
              />
            </label>
            <label class="text-xs text-text-secondary">
              Doc No.
              <input
                class={`${inputClass} mt-0.5 w-36`}
                placeholder="Slip / SO / PO…"
                value={draftDocNo()}
                onInput={(e) => commitDocNo(e.currentTarget.value)}
              />
            </label>
            <label class="text-xs text-text-secondary">
              Date from
              <input
                type="date"
                class={`${inputClass} mt-0.5`}
                value={props.filters.dateFrom}
                onInput={(e) => {
                  patch({ dateFrom: e.currentTarget.value });
                  props.onPageChange(1);
                }}
              />
            </label>
            <label class="text-xs text-text-secondary">
              Date to
              <input
                type="date"
                class={`${inputClass} mt-0.5`}
                value={props.filters.dateTo}
                onInput={(e) => {
                  patch({ dateTo: e.currentTarget.value });
                  props.onPageChange(1);
                }}
              />
            </label>
            <Show when={props.filters.partnerLocked && props.filters.partnerLabel}>
              <p class="flex items-center gap-2 rounded-md border border-stroke bg-slate-50 px-2 py-1.5 text-xs text-text-secondary">
                Partner: <span class="font-medium text-text-primary">{props.filters.partnerLabel}</span>
                <button
                  type="button"
                  class="underline"
                  onClick={() => {
                    props.onFiltersChange({
                      ...props.filters,
                      partnerId: null,
                      partnerLocked: false,
                    });
                    props.onPageChange(1);
                  }}
                >
                  Show all partners
                </button>
              </p>
            </Show>
            <button
              type="button"
              class="rounded border border-stroke px-2 py-1.5 text-xs"
              onClick={() => {
                const d = defaultMonitorDates(30);
                const next = { ...props.filters, dateFrom: d.dateFrom, dateTo: d.dateTo, q: "", docNo: "" };
                syncDraftsFromFilters(next);
                props.onFiltersChange(next);
                props.onPageChange(1);
              }}
            >
              Recent 30 days
            </button>
            <button
              type="button"
              class="rounded border border-stroke px-2 py-1.5 text-xs"
              onClick={() => {
                const next = { ...props.filters, dateFrom: "", dateTo: "", q: "", docNo: "" };
                syncDraftsFromFilters(next);
                props.onFiltersChange(next);
                props.onPageChange(1);
              }}
            >
              Clear dates (all open)
            </button>
          </div>

          <div class="min-h-0 flex-1 overflow-auto p-5">
            <Show when={props.loading}>
              <LoadingText class="text-sm text-text-secondary" as="p" />
            </Show>
            <Show when={props.error}>
              <p class="text-sm text-red-600">{String(props.error)}</p>
            </Show>
            <Show when={!props.loading && props.rows.length === 0}>
              <p class="text-sm text-text-secondary">
                {props.emptyHint ?? "No open load-slip lines for these filters. Widen the date range or clear Doc No."}
              </p>
            </Show>
            <Show when={props.rows.length > 0}>
              <table class="erp-grid min-w-full text-sm">
                <thead>
                  <tr class="border-b border-stroke text-left text-xs uppercase text-text-secondary">
                    <th class="w-10 py-2 pr-2">
                      <input
                        type="checkbox"
                        checked={props.selected.size > 0 && props.selected.size === props.rows.length}
                        onChange={() => props.onToggleAll()}
                        aria-label="Select all on page"
                      />
                    </th>
                    <For each={props.columns}>
                      {(col) => <th class={`py-2 pr-3 ${col.class ?? ""}`}>{col.header}</th>}
                    </For>
                  </tr>
                </thead>
                <tbody>
                  <For each={props.rows}>
                    {(row) => {
                      const id = props.rowKey(row);
                      return (
                        <tr class="border-b border-stroke/60 hover:bg-brand-50/40">
                          <td class="py-1.5 pr-2">
                            <input
                              type="checkbox"
                              checked={props.selected.has(id)}
                              onChange={() => props.onToggleRow(id)}
                              aria-label={`Select line ${id}`}
                            />
                          </td>
                          <For each={props.columns}>
                            {(col) => <td class={`py-1.5 pr-3 ${col.class ?? ""}`}>{col.cell(row)}</td>}
                          </For>
                        </tr>
                      );
                    }}
                  </For>
                </tbody>
              </table>
            </Show>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-2 border-t border-stroke px-5 py-3">
            <div class="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
              <Show when={props.onPageSizeChange}>
                <PageSizeSelect value={props.pageSize} onChange={(n) => { props.onPageSizeChange!(n); props.onPageChange(1); }} />
              </Show>
              <button
                type="button"
                class="rounded border border-stroke px-2 py-1 disabled:opacity-40"
                disabled={props.page <= 1}
                onClick={() => props.onPageChange(props.page - 1)}
              >
                Prev
              </button>
              <span>
                Page {props.page} / {totalPages()}
              </span>
              <button
                type="button"
                class="rounded border border-stroke px-2 py-1 disabled:opacity-40"
                disabled={props.page >= totalPages()}
                onClick={() => props.onPageChange(props.page + 1)}
              >
                Next
              </button>
              <span class="ml-2">{props.selected.size} selected</span>
            </div>
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              disabled={props.selected.size === 0}
              onClick={() => props.onApply()}
            >
              {props.applyLabel ?? "Apply Residual Qty (F8)"}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
