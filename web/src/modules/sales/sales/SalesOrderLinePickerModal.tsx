import { createEffect, createResource, createSignal, on } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { peekResource } from "../../../shared/peekResource";
import {
  OpenTransactionMonitor,
  buildOpenLineQuery,
  type OpenMonitorFilters,
} from "../../../shared/OpenTransactionMonitor";
import { openSlipSalesOrderStatusLabel } from "../../../shared/openSlipDocStatusLabel";
import { SlipNestedLines } from "../../../shared/SlipNestedLines";
import { checkedDocumentLines, slipLineSummary } from "../../../shared/slipDocument";
import { useToast } from "../../../shared/toast";

export type OpenSalesOrderLineRow = {
  sales_order_id: number;
  sales_order_line_id: number;
  date_no_display: string;
  order_date?: string;
  sales_order_no: string;
  progress_status?: string;
  customer_name: string;
  location_id: number;
  location_name: string;
  partner_id: number;
  tax_type_id: number;
  currency_id: number;
  pic_name: string;
  project_id?: number | null;
  project_name?: string;
  due_date?: string | null;
  payment_terms?: string;
  notes?: string;
  delivery_remarks?: string;
  reference?: string;
  source_quotation_id?: number | null;
  source_quotation_line_id?: number | null;
  quotation_id?: number | null;
  item_id?: number | null;
  item_code: string;
  item_name: string;
  description?: string | null;
  released_qty: number;
  delivered_qty?: number;
  balance_qty: number;
  unit_id?: number | null;
  unit_code?: string | null;
  unit_vat_inc: number;
  remark?: string | null;
  track_serial?: boolean;
};

export type PickedSalesOrderLine = OpenSalesOrderLineRow & {
  source_sales_order_line_id: number;
};

type OpenSalesOrderDocument = {
  sales_order_id: number;
  date_no_display: string;
  order_date?: string;
  sales_order_no: string;
  progress_status?: string;
  customer_name: string;
  open_line_count: number;
  source_line_count: number;
  skipped_no_item_count: number;
  lines: OpenSalesOrderLineRow[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (lines: PickedSalesOrderLine[]) => void;
  partnerId?: number | null;
  partnerLabel?: string;
};

const [pageSize, setPageSize] = createSignal(20);

export function SalesOrderLinePickerModal(props: Props) {
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
          // Default to all open SO lines (not last-30-days only) so confirmed orders are visible.
          dateFrom: "",
          dateTo: "",
          docNo: "",
          // Default: all partners' open SO lines (Ecount-style). Users can still filter by partner.
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
      const res = await apiFetch<OpenSalesOrderDocument[]>(`/api/v1/sales/sales-order-lines/open?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load sales order lines");
      return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
    },
  );

  const docs = () => peekResource(data)?.rows ?? [];
  const rows = () => docs() as unknown as Record<string, unknown>[];

  const toggleRow = (docId: number) => {
    const doc = docs().find((d) => d.sales_order_id === docId);
    setUnchecked((prev) => {
      const next = new Set(prev);
      for (const line of doc?.lines ?? []) next.delete(line.sales_order_line_id);
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
    const doc = docs().find((d) => d.sales_order_id === docId);
    const ids = (doc?.lines ?? []).map((line) => line.sales_order_line_id);
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
    else setSelected(new Set(list.map((r) => r.sales_order_id)));
    setUnchecked(new Set<number>());
  };

  const confirm = () => {
    const pickedDoc = checkedDocumentLines(
      docs().map((doc) => ({
        id: doc.sales_order_id,
        skipped_no_item_count: doc.skipped_no_item_count,
        lines: doc.lines,
      })),
      selected(),
      unchecked(),
      (line) => line.sales_order_line_id,
    );
    if (!pickedDoc) {
      toast.error("Select one sales order.");
      return;
    }
    const picked = pickedDoc.lines.map((r) => ({ ...r, source_sales_order_line_id: r.sales_order_line_id }));
    if (picked.length === 0) return;
    if (pickedDoc.skipped > 0) {
      toast.warning(`${pickedDoc.skipped} line(s) have no inventory item and were not loaded.`);
    }
    props.onConfirm(picked);
    props.onClose();
    setSelected(new Set<number>());
    setUnchecked(new Set<number>());
  };

  return (
    <OpenTransactionMonitor
      open={props.open}
      onClose={props.onClose}
      title="Load Slip — Sales Order"
      filters={filters()}
      onFiltersChange={setFilters}
      loading={data.loading}
      error={data.error}
      total={peekResource(data)?.total ?? 0}
      page={page()}
      pageSize={pageSize()} onPageSizeChange={setPageSize}
      onPageChange={setPage}
      rows={rows()}
      rowKey={(row) => Number(row.sales_order_id)}
      selected={selected()}
      onToggleRow={toggleRow}
      onToggleAll={toggleAll}
      onApply={confirm}
      emptyHint="No open Sales Order lines to invoice. Confirm the SO (In progress or Completed) first. Fully invoiced lines are hidden. Scan serials on this sale when you Save — Pick List is optional in legacy combined mode."
      columns={[
        { key: "date_no", header: "Date-No.", cell: (r) => String(r.date_no_display ?? "") },
        { key: "so", header: "SO No.", cell: (r) => String(r.sales_order_no ?? "") },
        {
          key: "status",
          header: "Status",
          cell: (r) =>
            openSlipSalesOrderStatusLabel(
              String(r.progress_status ?? ""),
              Number(r.delivered_qty ?? 0),
            ),
        },
        { key: "customer", header: "Customer", cell: (r) => String(r.customer_name ?? "") },
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
          onToggle={(lineId) => toggleLine(Number(row.sales_order_id), lineId)}
          lines={((row.lines as OpenSalesOrderLineRow[] | undefined) ?? []).map((line) => ({
            id: line.sales_order_line_id,
            label: `${line.item_code ?? ""} ${line.item_name ?? ""}`.trim(),
            qty: String(line.balance_qty ?? 0),
          }))}
        />
      )}
    />
  );
}
