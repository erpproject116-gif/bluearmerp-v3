import { createEffect, createResource, createSignal, on } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { peekResource } from "../../../shared/peekResource";
import { SlipNestedLines } from "../../../shared/SlipNestedLines";
import { checkedDocumentLines, slipLineSummary } from "../../../shared/slipDocument";
import { useToast } from "../../../shared/toast";
import {
  OpenTransactionMonitor,
  buildOpenLineQuery,
  type OpenMonitorFilters,
} from "../../../shared/OpenTransactionMonitor";
import { openSlipDocStatusLabel } from "../../../shared/openSlipDocStatusLabel";

export type OpenQuotationLineRow = {
  quotation_id: number;
  quotation_line_id: number;
  order_date?: string;
  date_no_display: string;
  reference_no: string;
  progress_status?: string;
  customer_name: string;
  location_id: number;
  location_name: string;
  partner_id: number;
  tax_type_id: number;
  currency_id: number;
  pic_user_id?: number | null;
  pic_name: string;
  project_id?: number | null;
  project_name?: string;
  valid_until?: string | null;
  quotation_validity_text?: string;
  payment_terms?: string;
  note_for_pic_only?: string;
  notes?: string;
  item_id?: number | null;
  item_code: string;
  item_name: string;
  description?: string | null;
  qty: number;
  balance_qty: number;
  unit_id?: number | null;
  unit_code?: string | null;
  unit_vat_inc: number;
  remark?: string | null;
  planned_serial_nos?: string[];
  track_serial?: boolean;
  serial_policy?: string;
};

export type PickedQuotationLine = OpenQuotationLineRow & {
  source_quotation_line_id: number;
};

export type OpenQuotationDocument = {
  quotation_id: number;
  order_date?: string;
  date_no_display: string;
  reference_no: string;
  progress_status?: string;
  customer_name: string;
  open_line_count: number;
  source_line_count: number;
  skipped_no_item_count: number;
  lines: OpenQuotationLineRow[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (lines: PickedQuotationLine[]) => void;
  partnerId?: number | null;
  partnerLabel?: string;
};

const [pageSize, setPageSize] = createSignal(20);

export function QuotationLinePickerModal(props: Props) {
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
  const [selected, setSelected] = createSignal<Set<number>>(new Set<number>());
  const [unchecked, setUnchecked] = createSignal<Set<number>>(new Set<number>());

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
          // Default to all open quotation lines (not last-30-days only).
          dateFrom: "",
          dateTo: "",
          docNo: "",
          // Default: all partners (Ecount-style). Form partner is a hint label only.
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
      const res = await apiFetch<OpenQuotationDocument[]>(
        `/api/v1/sales-order/sales-orders/quotation-lines/open?${qs}`,
      );
      if (!res.success) throw new Error(res.message ?? "Failed to load quotation lines");
      return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
    },
  );

  const docs = () => peekResource(data)?.rows ?? [];
  const rows = () => docs() as unknown as Record<string, unknown>[];

  const toggleRow = (docId: number) => {
    const doc = docs().find((d) => d.quotation_id === docId);
    setUnchecked((prev) => {
      const next = new Set<number>(prev);
      for (const line of doc?.lines ?? []) next.delete(line.quotation_line_id);
      return next;
    });
    setSelected((prev) => {
      const next = new Set<number>(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const toggleLine = (docId: number, lineId: number) => {
    const doc = docs().find((d) => d.quotation_id === docId);
    const ids = (doc?.lines ?? []).map((line) => line.quotation_line_id);
    setUnchecked((prev) => {
      const next = new Set<number>(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      const anyChecked = ids.some((id) => !next.has(id));
      setSelected((selectedIds) => {
        const nextDocs = new Set<number>(selectedIds);
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
    else setSelected(new Set<number>(list.map((r) => r.quotation_id)));
    setUnchecked(new Set<number>());
  };

  const confirm = () => {
    const pickedDoc = checkedDocumentLines(
      docs().map((doc) => ({
        id: doc.quotation_id,
        skipped_no_item_count: doc.skipped_no_item_count,
        lines: doc.lines,
      })),
      selected(),
      unchecked(),
      (line) => line.quotation_line_id,
    );
    if (!pickedDoc) {
      toast.error("Select one quotation.");
      return;
    }
    const picked = pickedDoc.lines
      .map((r) => {
        const lineId = Number(r.quotation_line_id);
        return { ...r, quotation_line_id: lineId, source_quotation_line_id: lineId };
      })
      .filter((r) => r.source_quotation_line_id > 0);
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
      title="Load Slip — Quotation"
      filters={filters()}
      onFiltersChange={setFilters}
      loading={data.loading}
      error={data.error}
      total={peekResource(data)?.total ?? 0}
      page={page()}
      pageSize={pageSize()} onPageSizeChange={setPageSize}
      onPageChange={setPage}
      rows={rows()}
      rowKey={(row) => Number(row.quotation_id)}
      selected={selected()}
      onToggleRow={toggleRow}
      onToggleAll={toggleAll}
      onApply={confirm}
      emptyHint="No open quotation lines with registered inventory items. Free-text quotation lines must be linked to Inventory items before Load Slip. Clear Search/Doc No or dates if filtered."
      columns={[
        { key: "date_no", header: "Date-No.", cell: (r) => String(r.date_no_display ?? "") },
        { key: "ref", header: "Quotation", cell: (r) => String(r.reference_no ?? "") },
        {
          key: "status",
          header: "Status",
          cell: (r) => openSlipDocStatusLabel(String(r.progress_status ?? "")),
        },
        { key: "customer", header: "Customer", cell: (r) => String(r.customer_name ?? "") },
        {
          key: "lines",
          header: "Lines",
          cell: (r) =>
            slipLineSummary(
              Number(r.open_line_count ?? 0),
              Number(r.source_line_count ?? 0),
              Number(r.skipped_no_item_count ?? 0),
            ),
        },
      ]}
      renderDetail={(row) => (
        <SlipNestedLines
          unchecked={unchecked()}
          onToggle={(lineId) => toggleLine(Number(row.quotation_id), lineId)}
          lines={((row.lines as OpenQuotationLineRow[] | undefined) ?? []).map((line) => ({
            id: line.quotation_line_id,
            label: `${line.item_code ?? ""} ${line.item_name ?? ""}`.trim(),
            qty: String(line.balance_qty ?? 0),
          }))}
        />
      )}
    />
  );
}
