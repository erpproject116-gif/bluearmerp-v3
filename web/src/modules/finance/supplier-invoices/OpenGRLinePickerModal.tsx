import { createEffect, createResource, createSignal, on } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { peekResource } from "../../../shared/peekResource";
import {
  OpenTransactionMonitor,
  buildOpenLineQuery,
  type OpenMonitorFilters,
} from "../../../shared/OpenTransactionMonitor";
import type { OpenGRLine } from "../../../shared/useSupplierInvoiceList";
import { SlipNestedLines } from "../../../shared/SlipNestedLines";
import { checkedDocumentLines, slipLineSummary } from "../../../shared/slipDocument";
import { useToast } from "../../../shared/toast";

type Props = {
  open: boolean;
  partnerId?: number | null;
  partnerLabel?: string;
  onClose: () => void;
  onConfirm: (lines: OpenGRLine[]) => void;
  mapOnly?: boolean;
};

const [pageSize, setPageSize] = createSignal(20);

type OpenGRDocument = {
  goods_receipt_id: number;
  purchase_order_no: string;
  partner_name: string;
  open_line_count: number;
  source_line_count: number;
  skipped_no_item_count: number;
  lines: OpenGRLine[];
};

export function OpenGRLinePickerModal(props: Props) {
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

  createEffect(
    on(
      () => props.open,
      (open) => {
        if (!open) return;
        setSelected(new Set<number>());
        setUnchecked(new Set<number>());
        setPage(1);
        setFilters({
          q: "",
          // Default to all open GR lines (not last-30-days only).
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
      const res = await apiFetch<OpenGRDocument[]>(`/api/v1/finance/supplier-invoices/open-gr-lines?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load goods receipt lines");
      return { rows: res.data ?? [], total: res.meta?.total ?? (res.data?.length ?? 0) };
    },
  );

  const docs = () => peekResource(data)?.rows ?? [];
  const rows = () => docs() as unknown as Record<string, unknown>[];

  const toggleRow = (docId: number) => {
    const doc = docs().find((d) => d.goods_receipt_id === docId);
    setUnchecked((prev) => {
      const next = new Set(prev);
      for (const line of doc?.lines ?? []) next.delete(line.goods_receipt_line_id);
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
    const doc = docs().find((d) => d.goods_receipt_id === docId);
    const ids = (doc?.lines ?? []).map((line) => line.goods_receipt_line_id);
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
    const list = docs();
    if (selected().size === list.length) setSelected(new Set<number>());
    else setSelected(new Set(list.map((r) => r.goods_receipt_id)));
    setUnchecked(new Set<number>());
  };

  const apply = () => {
    const pickedDoc = checkedDocumentLines(
      docs().map((doc) => ({
        id: doc.goods_receipt_id,
        skipped_no_item_count: doc.skipped_no_item_count,
        lines: doc.lines,
      })),
      selected(),
      unchecked(),
      (line) => line.goods_receipt_line_id,
    );
    if (!pickedDoc) {
      toast.error("Select one purchase receive.");
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

  return (
    <OpenTransactionMonitor
      title={props.mapOnly ? "Map from Purchase Receive" : "Load Slip — Purchase Receive"}
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
      rowKey={(row) => Number(row.goods_receipt_id)}
      selected={selected()}
      onToggleRow={toggleRow}
      onToggleAll={toggleAll}
      columns={[
        {
          key: "po",
          header: "PO",
          cell: (r) => String(r.purchase_order_no ?? ""),
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
          onToggle={(lineId) => toggleLine(Number(row.goods_receipt_id), lineId)}
          lines={((row.lines as OpenGRLine[] | undefined) ?? []).map((line) => ({
            id: line.goods_receipt_line_id,
            label: `${line.item_code ?? ""} ${line.item_name ?? ""}`.trim(),
            qty: String(line.balance_qty ?? 0),
          }))}
        />
      )}
      onApply={apply}
      applyLabel={props.mapOnly ? "Map selected lines" : undefined}
      emptyHint="No open GR lines with remaining qty. Clear date/vendor filters, or confirm goods were received and not already fully purchased."
    />
  );
}
