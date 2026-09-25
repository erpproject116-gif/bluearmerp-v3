import { createEffect, createResource, createSignal, on } from "solid-js";
import { apiFetch } from "../../../shared/api";
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
  pic_name: string;
  project_id?: number | null;
  project_name?: string;
  valid_until?: string | null;
  payment_terms?: string;
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
};

export type PickedQuotationLine = OpenQuotationLineRow & {
  source_quotation_line_id: number;
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

  createEffect(
    on(
      () => props.open,
      (open) => {
        if (!open) return;
        setSelected(new Set<number>());
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
      const res = await apiFetch<OpenQuotationLineRow[]>(
        `/api/v1/sales-order/sales-orders/quotation-lines/open?${qs}`,
      );
      if (!res.success) throw new Error(res.message ?? "Failed to load quotation lines");
      return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
    },
  );

  const rows = () => (data()?.rows ?? []) as unknown as Record<string, unknown>[];

  const toggleRow = (lineId: number) => {
    setSelected((prev) => {
      const next = new Set<number>(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  };

  const toggleAll = () => {
    const list = data()?.rows ?? [];
    if (selected().size === list.length) setSelected(new Set<number>());
    else setSelected(new Set<number>(list.map((r) => r.quotation_line_id)));
  };

  const confirm = () => {
    const list = data()?.rows ?? [];
    const picked = list
      .filter((r) => selected().has(r.quotation_line_id))
      .map((r) => {
        const lineId = Number(r.quotation_line_id);
        return {
          ...r,
          quotation_line_id: lineId,
          source_quotation_line_id: lineId,
        };
      })
      .filter((r) => r.source_quotation_line_id > 0);
    if (picked.length === 0) return;
    props.onConfirm(picked);
    props.onClose();
    setSelected(new Set<number>());
  };

  return (
    <OpenTransactionMonitor
      open={props.open}
      onClose={props.onClose}
      title="Load Slip — Quotation (open lines)"
      filters={filters()}
      onFiltersChange={setFilters}
      loading={data.loading}
      error={data.error}
      total={data()?.total ?? 0}
      page={page()}
      pageSize={pageSize()} onPageSizeChange={setPageSize}
      onPageChange={setPage}
      rows={rows()}
      rowKey={(row) => Number(row.quotation_line_id)}
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
        { key: "item", header: "Item", cell: (r) => `${r.item_code ?? ""} ${r.item_name ?? ""}` },
        { key: "bal", header: "Balance", class: "text-right", cell: (r) => Number(r.balance_qty ?? 0) },
        { key: "uom", header: "UoM", cell: (r) => String(r.unit_code ?? "") },
        { key: "price", header: "Unit price", class: "text-right", cell: (r) => Number(r.unit_vat_inc ?? 0) },
      ]}
    />
  );
}
