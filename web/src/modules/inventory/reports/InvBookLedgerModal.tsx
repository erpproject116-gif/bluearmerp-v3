import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { useNavigate } from "@solidjs/router";
import { apiFetch } from "../../../shared/api";
import { PageJumpControl } from "../../../shared/PageJumpControl";
import { PageSizeSelect } from "../../../shared/pageSize";
import { defaultReportDateRange } from "../../../shared/reports/ReportPageLayout";
import { ReportLoadingOverlay } from "../../../shared/reports/ReportLoadingOverlay";
import { GridExportButtons } from "../../../shared/gridExport";
import {
  useInvBookSlips,
  type InvBookSlipFilters,
  type InvBookSlipRow,
} from "../../../shared/reports/useModuleReports";
import { useToast } from "../../../shared/toast";
import { SupplierInvoiceModal } from "../../finance/supplier-invoices/SupplierInvoiceModal";
import type { SupplierInvoiceDetail } from "../../../shared/useSupplierInvoiceList";
import { SalesModal, type SalesDetail } from "../../sales/sales/SalesModal";

export type InvBookLedgerTarget = {
  item_id: number;
  item_code: string;
  item_name: string;
  location_id?: number;
  location_name?: string;
};

type Props = {
  open: boolean;
  row: InvBookLedgerTarget | null;
  /** Period for slips; defaults to last ~30 days when omitted. */
  period?: { date_from?: string; date_to?: string };
  onClose: () => void;
};

type InvBookSource = {
  kind: "sales" | "purchase" | "manufacturing";
  doc_id: number;
  label?: string;
};

/** Jobs list filtered to one job number. */
export function manufacturingJobHref(workOrderNo: string): string {
  const qs = new URLSearchParams({ q: workOrderNo });
  return `/app/production/all/jobs?${qs}`;
}

function fmtQty(n: number | undefined) {
  if (n == null || !Number.isFinite(n) || Math.abs(n) < 0.0000001) return "";
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function fmtQtyOrZero(n: number | undefined) {
  if (n == null || !Number.isFinite(n)) return "0";
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

/** Ref types the Inv. Book source resolver can open as Sale / Purchase Receive / manufacturing job. */
const DRILLABLE_REF_TYPES = new Set([
  "sales",
  "sa_sales",
  "sa_sales_line",
  "supplier_invoice",
  "fin_supplier_invoice",
  "goods_receipt",
  "mfg_work_order",
]);

function canDrill(row: InvBookSlipRow) {
  if (row.is_beginning) return false;
  const refType = (row.ref_type ?? "").trim().toLowerCase();
  const refId = row.ref_id;
  return DRILLABLE_REF_TYPES.has(refType) && refId != null && Number(refId) > 0;
}

export function InvBookLedgerModal(props: Props) {
  const toast = useToast();
  const navigate = useNavigate();
  const [page, setPage] = createSignal(1);
  const [runId, setRunId] = createSignal(0);
  const [openingSource, setOpeningSource] = createSignal(false);
  const [salesDoc, setSalesDoc] = createSignal<SalesDetail | null>(null);
  const [purchaseDoc, setPurchaseDoc] = createSignal<SupplierInvoiceDetail | null>(null);
  const [pageSize, setPageSize] = createSignal(100);
  let tableRoot: HTMLDivElement | undefined;

  createEffect(() => {
    if (!props.open || !props.row) return;
    setPage(1);
    setRunId((n) => n + 1);
    setSalesDoc(null);
    setPurchaseDoc(null);
  });

  createEffect(() => {
    if (!props.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (salesDoc() || purchaseDoc()) {
          e.preventDefault();
          setSalesDoc(null);
          setPurchaseDoc(null);
          return;
        }
        e.preventDefault();
        props.onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  const period = (): { date_from: string; date_to: string } => {
    const d = defaultReportDateRange();
    return {
      date_from: props.period?.date_from || d.date_from,
      date_to: props.period?.date_to || d.date_to,
    };
  };

  const filters = (): InvBookSlipFilters => {
    const row = props.row;
    const p = period();
    return {
      date_from: p.date_from,
      date_to: p.date_to,
      item_id: row?.item_id ?? 0,
      location_id: row?.location_id,
    };
  };

  const report = useInvBookSlips(() => ({
    filters: filters(),
    page: page(),
    pageSize: pageSize(),
    sort: "created_at",
    order: "asc",
    enabled: props.open && props.row != null,
    runId: runId(),
  }));

  const pageTotals = createMemo(() => {
    const rows = report.data?.rows ?? [];
    let increase = 0;
    let release = 0;
    let ending = 0;
    for (const row of rows) {
      if (row.is_beginning) {
        ending = row.inventory_qty ?? 0;
        continue;
      }
      increase += row.increase_qty ?? 0;
      release += row.release_qty ?? 0;
      ending = row.inventory_qty ?? ending;
    }
    return { increase, release, ending };
  });

  const totalPages = () => Math.max(1, Math.ceil((report.data?.total ?? 0) / pageSize()));
  const title = () => {
    const row = props.row;
    if (!row) return "Inv. Book";
    return `${row.item_name} (${row.item_code})`;
  };

  const openSource = async (row: InvBookSlipRow) => {
    if (!canDrill(row) || openingSource()) return;
    setOpeningSource(true);
    try {
      const qs = new URLSearchParams({
        ref_type: String(row.ref_type ?? ""),
        ref_id: String(row.ref_id ?? ""),
      });
      const src = await apiFetch<InvBookSource>(`/api/v1/inventory/reports/inv-book/source?${qs}`, {}, { silent: true });
      if (!src.success || !src.data?.doc_id) {
        toast.warning(src.message?.trim() || "No Sale, Purchase Receive, or job is linked to this movement.");
        return;
      }
      if (src.data.kind === "manufacturing") {
        const jobNo = (src.data.label ?? "").trim();
        if (!jobNo) {
          toast.warning("This job has no number to look up.");
          return;
        }
        props.onClose();
        navigate(manufacturingJobHref(jobNo));
        return;
      }
      if (src.data.kind === "sales") {
        const detail = await apiFetch<SalesDetail>(`/api/v1/sales/${src.data.doc_id}?lifecycle=all`, {}, { silent: true });
        if (!detail.success || !detail.data) {
          toast.warning(detail.message?.trim() || "Could not load the Sales document.");
          return;
        }
        setPurchaseDoc(null);
        setSalesDoc(detail.data);
        return;
      }
      if (src.data.kind === "purchase") {
        const detail = await apiFetch<SupplierInvoiceDetail>(
          `/api/v1/finance/supplier-invoices/${src.data.doc_id}?lifecycle=all`,
          {},
          { silent: true },
        );
        if (!detail.success || !detail.data) {
          toast.warning(detail.message?.trim() || "Could not load the Purchase Receive.");
          return;
        }
        setSalesDoc(null);
        setPurchaseDoc(detail.data);
        return;
      }
      toast.warning("This movement type cannot open a Sale, Purchase Receive, or job.");
    } finally {
      setOpeningSource(false);
    }
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
                  Inv. Book
                </h2>
                <p class="mt-0.5 text-sm text-text-secondary">
                  {title()}
                  <Show when={props.row?.location_name}> · {props.row!.location_name}</Show>
                  {" · "}
                  {period().date_from} → {period().date_to}
                </p>
                <p class="mt-1 text-xs text-text-secondary">
                  Click a Sale or Purchase date to open the source document (read-only). Click a job date to open that job on the Jobs list. Manufacturing rows show the job number as Customer/Vendor.
                </p>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <GridExportButtons
                  title={`Inv. Book — ${title()}`}
                  filename={`inv-book-${props.row!.item_code}`}
                  columns={[]}
                  rows={() => []}
                  scrapeRoot={() => tableRoot ?? null}
                />
                <button
                  type="button"
                  class="rounded-lg border border-stroke px-3 py-1.5 text-sm text-text-secondary hover:bg-slate-50"
                  aria-label="Close inv. book"
                  onClick={() => props.onClose()}
                >
                  Close
                </button>
              </div>
            </div>

            <div class="min-h-0 flex-1 overflow-auto px-5 py-3" ref={(el) => (tableRoot = el)}>
              <ReportLoadingOverlay loading={report.isFetching || openingSource()}>
                <table class="erp-grid min-w-full text-left text-sm">
                  <thead class="sticky top-0 z-[1] bg-brand-50 text-xs font-semibold uppercase text-brand-700">
                    <tr>
                      <th class="px-3 py-2">Date</th>
                      <th class="px-3 py-2">Customer/Vendor Name</th>
                      <th class="px-3 py-2">Remark</th>
                      <th class="px-3 py-2 text-right">Increase</th>
                      <th class="px-3 py-2 text-right">Release Qty</th>
                      <th class="px-3 py-2 text-right">Inventory Qty</th>
                      <th class="px-3 py-2">Serial/Lot No.</th>
                      <th class="px-3 py-2">Location Name</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={report.data?.rows ?? []}>
                      {(row) => (
                        <tr
                          class={`border-t border-stroke/60 ${row.is_beginning ? "bg-amber-50/60 font-medium text-red-700" : ""}`}
                        >
                          <td class="px-3 py-2 whitespace-nowrap">
                            <Show
                              when={canDrill(row)}
                              fallback={<span>{row.created_at?.slice?.(0, 10) ?? row.created_at}</span>}
                            >
                              <button
                                type="button"
                                class="text-left text-brand-700 hover:underline disabled:opacity-50"
                                disabled={openingSource()}
                                onClick={() => void openSource(row)}
                              >
                                {row.created_at?.slice?.(0, 10) ?? row.created_at}
                              </button>
                            </Show>
                          </td>
                          <td class="px-3 py-2">{row.partner_name}</td>
                          <td class="px-3 py-2 text-text-secondary">{row.remark}</td>
                          <td class="px-3 py-2 text-right tabular-nums">{fmtQty(row.increase_qty)}</td>
                          <td class="px-3 py-2 text-right tabular-nums">{fmtQty(row.release_qty)}</td>
                          <td class="px-3 py-2 text-right tabular-nums font-medium">
                            {row.is_beginning ? fmtQtyOrZero(row.inventory_qty) : fmtQty(row.inventory_qty)}
                          </td>
                          <td class="max-w-[14rem] px-3 py-2 text-xs break-words">{row.serial_lot_nos}</td>
                          <td class="px-3 py-2 whitespace-nowrap">{row.location_name}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                  <Show when={(report.data?.rows?.length ?? 0) > 0}>
                    <tfoot>
                      <tr class="border-t-2 border-brand-200 bg-slate-50 font-semibold text-text-primary">
                        <td class="px-3 py-2" colspan={3}>
                          Page total
                          <Show when={totalPages() > 1}>
                            <span class="ml-1 font-normal text-text-secondary">(this page)</span>
                          </Show>
                        </td>
                        <td class="px-3 py-2 text-right tabular-nums">{fmtQtyOrZero(pageTotals().increase)}</td>
                        <td class="px-3 py-2 text-right tabular-nums">{fmtQtyOrZero(pageTotals().release)}</td>
                        <td class="px-3 py-2 text-right tabular-nums text-brand-700">
                          {fmtQtyOrZero(pageTotals().ending)}
                          <div class="text-[10px] font-normal uppercase tracking-wide text-text-secondary">Ending</div>
                        </td>
                        <td class="px-3 py-2" colspan={2} />
                      </tr>
                    </tfoot>
                  </Show>
                </table>
                <Show when={(report.data?.rows?.length ?? 0) === 0 && !report.isFetching}>
                  <p class="px-2 py-8 text-center text-sm text-text-secondary">No inv. book movements in this date range.</p>
                </Show>
                <Show when={report.isError}>
                  <p class="px-2 py-4 text-center text-sm text-red-600">
                    {(report.error as Error)?.message ?? "Failed to load inv. book."}
                  </p>
                </Show>
              </ReportLoadingOverlay>
            </div>

            <div class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-stroke px-5 py-3 text-sm">
              <span class="text-text-secondary">
                {report.data?.total ?? 0} movement(s)
                <Show when={(report.data?.rows?.length ?? 0) > 0}>
                  {" · "}
                  Net +{fmtQtyOrZero(pageTotals().increase - pageTotals().release)} this page
                  {" · Ending "}
                  {fmtQtyOrZero(pageTotals().ending)}
                  <Show when={pageTotals().ending < -0.0000001}>
                    {" · Issued more than received in this book."}
                  </Show>
                </Show>
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
                <PageSizeSelect value={pageSize()} onChange={(n) => { setPageSize(n); setPage(1); }} />
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

        <SalesModal
          open={salesDoc() != null}
          editing={salesDoc()}
          templateCode={salesDoc()?.template_code ?? "default"}
          readOnly
          onClose={() => setSalesDoc(null)}
          onSaved={() => setSalesDoc(null)}
        />
        <SupplierInvoiceModal
          open={purchaseDoc() != null}
          editing={purchaseDoc()}
          readOnly
          onClose={() => setPurchaseDoc(null)}
          onSaved={() => setPurchaseDoc(null)}
        />
      </Portal>
    </Show>
  );
}
