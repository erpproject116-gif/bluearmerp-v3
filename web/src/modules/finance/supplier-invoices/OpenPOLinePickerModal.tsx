import { createEffect, createMemo, createResource, createSignal, For, on } from "solid-js";
import { peekResource } from "../../../shared/peekResource";
import { apiFetch } from "../../../shared/api";
import {
  OpenTransactionMonitor,
  buildOpenLineQuery,
  type OpenMonitorFilters,
} from "../../../shared/OpenTransactionMonitor";
import { openSlipDocStatusLabel } from "../../../shared/openSlipDocStatusLabel";
import type { OpenPOLine } from "../../../shared/useSupplierInvoiceList";
import { SlipNestedLines } from "../../../shared/SlipNestedLines";
import { checkedDocumentLines, slipLineSummary } from "../../../shared/slipDocument";
import { useToast } from "../../../shared/toast";

type Props = {
  open: boolean;
  partnerId?: number | null;
  partnerLabel?: string;
  onClose: () => void;
  onConfirm: (lines: OpenPOLine[]) => void;
  /** When true, apply does not require a header vendor — for cross-module map. */
  mapOnly?: boolean;
};

type StatusChip = "all" | "in_progress" | "finished";

const [pageSize, setPageSize] = createSignal(20);

type OpenPODocument = {
  purchase_order_id: number;
  purchase_order_no: string;
  status: string;
  progress_status: string;
  order_date?: string;
  partner_name: string;
  open_line_count: number;
  source_line_count: number;
  skipped_no_item_count: number;
  lines: OpenPOLine[];
};

function poChip(status: string, progress: string): StatusChip {
  const s = (status || "").toLowerCase();
  if (s === "received") return "finished";
  void progress;
  return "in_progress";
}

export function OpenPOLinePickerModal(props: Props) {
  const toast = useToast();
  const [filters, setFilters] = createSignal<OpenMonitorFilters>({
    q: "",
    dateFrom: "",
    dateTo: "",
    docNo: "",
    partnerId: null,
    partnerLocked: false,
    partnerLabel: "",
  });
  const [page, setPage] = createSignal(1);
  const [selected, setSelected] = createSignal(new Set<number>());
  const [unchecked, setUnchecked] = createSignal(new Set<number>());
  const [statusChip, setStatusChip] = createSignal<StatusChip>("all");

  createEffect(
    on(
      () => props.open,
      (open) => {
        if (!open) return;
        setSelected(new Set<number>());
        setUnchecked(new Set<number>());
        setPage(1);
        setStatusChip("all");
        setFilters({
          q: "",
          dateFrom: "",
          dateTo: "",
          docNo: "",
          partnerId: null,
          partnerLocked: false,
          partnerLabel: props.partnerLabel ?? "",
        });
      },
    ),
  );

  const [data] = createResource(
    () => (props.open ? { filters: filters(), page: page() } : null),
    async (p) => {
      const qs = buildOpenLineQuery({ page: p!.page, pageSize: pageSize(), filters: p!.filters });
      const res = await apiFetch<OpenPODocument[]>(`/api/v1/finance/supplier-invoices/open-po-lines?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load purchase order lines");
      return { rows: res.data ?? [], total: res.meta?.total ?? (res.data?.length ?? 0) };
    },
  );

  const filteredRows = createMemo(() => {
    const list = peekResource(data)?.rows ?? [];
    const chip = statusChip();
    if (chip === "all") return list;
    return list.filter((r) => poChip(String(r.status ?? ""), String(r.progress_status ?? "")) === chip);
  });

  const rows = () => filteredRows() as unknown as Record<string, unknown>[];

  const toggleRow = (docId: number) => {
    const doc = filteredRows().find((d) => d.purchase_order_id === docId);
    setUnchecked((prev) => {
      const next = new Set(prev);
      for (const line of doc?.lines ?? []) next.delete(line.purchase_order_line_id);
      return next;
    });
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const toggleLine = (docId: number, lineId: number) => {
    const doc = filteredRows().find((d) => d.purchase_order_id === docId);
    const ids = (doc?.lines ?? []).map((line) => line.purchase_order_line_id);
    setUnchecked((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      const anyChecked = ids.some((id) => !next.has(id));
      setSelected((selectedIds) => {
        const nextDocs = new Set(selectedIds);
        if (anyChecked) nextDocs.add(docId);
        else nextDocs.delete(docId);
        return nextDocs;
      });
      return next;
    });
  };

  const toggleAll = () => {
    const list = filteredRows();
    if (selected().size === list.length) setSelected(new Set<number>());
    else setSelected(new Set(list.map((r) => r.purchase_order_id)));
    setUnchecked(new Set<number>());
  };

  const apply = () => {
    const pickedDoc = checkedDocumentLines(
      filteredRows().map((doc) => ({
        id: doc.purchase_order_id,
        skipped_no_item_count: doc.skipped_no_item_count,
        lines: doc.lines,
      })),
      selected(),
      unchecked(),
      (line) => line.purchase_order_line_id,
    );
    if (!pickedDoc) {
      toast.error("Select one purchase order.");
      return;
    }
    if (pickedDoc.skipped > 0) {
      toast.warning(`${pickedDoc.skipped} line(s) have no inventory item and were not loaded.`);
    }
    props.onConfirm(pickedDoc.lines);
    props.onClose();
    setSelected(new Set<number>());
    setUnchecked(new Set<number>());
  };

  const chips: { id: StatusChip; label: string }[] = [
    { id: "all", label: "All" },
    { id: "in_progress", label: "In Progress" },
    { id: "finished", label: "Finished" },
  ];

  return (
    <OpenTransactionMonitor
      title={props.mapOnly ? "Map from Purchase Order" : "Load Slip — Purchase Order"}
      open={props.open}
      onClose={props.onClose}
      filters={filters()}
      onFiltersChange={setFilters}
      loading={data.loading}
      error={data.error}
      total={peekResource(data)?.total ?? 0}
      page={page()}
      pageSize={pageSize()} onPageSizeChange={setPageSize}
      onPageChange={setPage}
      rows={rows()}
      rowKey={(row) => Number(row.purchase_order_id)}
      selected={selected()}
      onToggleRow={toggleRow}
      onToggleAll={toggleAll}
      toolbar={
        <div class="flex flex-wrap items-center gap-2">
          <For each={chips}>
            {(c) => (
              <button
                type="button"
                class={`rounded px-2.5 py-1 text-xs font-medium ${
                  statusChip() === c.id ? "bg-brand-600 text-white" : "border border-stroke text-text-secondary hover:bg-slate-50"
                }`}
                onClick={() => {
                  setStatusChip(c.id);
                  setSelected(new Set<number>());
                  setUnchecked(new Set<number>());
                }}
              >
                {c.label}
              </button>
            )}
          </For>
          <span class="text-[11px] text-text-secondary">Finished POs with unbilled qty remain available</span>
        </div>
      }
      columns={[
        {
          key: "po",
          header: "PO",
          cell: (r) => String(r.purchase_order_no ?? ""),
        },
        {
          key: "status",
          header: "Status",
          cell: (r) => {
            const status = String(r.status ?? "");
            const progress = String(r.progress_status ?? "");
            if (status === "draft" || progress === "unconfirmed") {
              return "Unconfirmed";
            }
            if (status === "received") {
              return "Finished";
            }
            return openSlipDocStatusLabel(status || progress);
          },
        },
        {
          key: "partner",
          header: "Vendor",
          cell: (r) => String(r.partner_name ?? ""),
        },
        {
          key: "lines",
          header: "Lines",
          cell: (r) =>
            slipLineSummary(Number(r.open_line_count ?? 0), Number(r.source_line_count ?? 0), Number(r.skipped_no_item_count ?? 0)),
        },
      ]}
      renderDetail={(row) => (
        <SlipNestedLines
          unchecked={unchecked()}
          onToggle={(lineId) => toggleLine(Number(row.purchase_order_id), lineId)}
          lines={((row.lines as OpenPOLine[] | undefined) ?? []).map((line) => ({
            id: line.purchase_order_line_id,
            label: `${line.item_code ?? ""} ${line.item_name ?? ""}`.trim(),
            qty: String(line.balance_qty ?? 0),
          }))}
        />
      )}
      onApply={apply}
      applyLabel={props.mapOnly ? "Map selected lines" : undefined}
      emptyHint="No open Purchase Order lines left to receive. Fully received POs won’t appear here — use Load Slip → Bill if you only need to invoice a prior GR. Clear filters and try All."
    />
  );
}
