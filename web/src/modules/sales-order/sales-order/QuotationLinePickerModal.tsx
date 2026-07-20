import { createEffect, createResource, createSignal } from "solid-js";
import { apiFetch } from "../../../shared/api";
import {
  OpenTransactionMonitor,
  buildOpenLineQuery,
  defaultMonitorDates,
  type OpenMonitorFilters,
} from "../../../shared/OpenTransactionMonitor";

export type OpenQuotationLineRow = {
  quotation_id: number;
  quotation_line_id: number;
  date_no_display: string;
  reference_no: string;
  customer_name: string;
  location_id: number;
  location_name: string;
  partner_id: number;
  tax_type_id: number;
  currency_id: number;
  pic_name: string;
  item_id?: number | null;
  item_code: string;
  item_name: string;
  description?: string | null;
  qty: number;
  balance_qty: number;
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

const pageSize = 50;

export function QuotationLinePickerModal(props: Props) {
  const dates = defaultMonitorDates(30);
  const [filters, setFilters] = createSignal<OpenMonitorFilters>({
    q: "",
    dateFrom: dates.dateFrom,
    dateTo: dates.dateTo,
    docNo: "",
    partnerId: null,
    partnerLocked: false,
    partnerLabel: "",
  });
  const [page, setPage] = createSignal(1);
  const [selected, setSelected] = createSignal<Set<number>>(new Set<number>());

  createEffect(() => {
    if (!props.open) return;
    setSelected(new Set<number>());
    setPage(1);
    const d = defaultMonitorDates(30);
    setFilters({
      q: "",
      dateFrom: d.dateFrom,
      dateTo: d.dateTo,
      docNo: "",
      partnerId: props.partnerId ?? null,
      partnerLocked: Boolean(props.partnerId),
      partnerLabel: props.partnerLabel ?? "",
    });
  });

  const [data] = createResource(
    () => (props.open ? { filters: filters(), page: page() } : null),
    async (p) => {
      const qs = buildOpenLineQuery({ page: p!.page, pageSize, filters: p!.filters });
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
      .map((r) => ({ ...r, source_quotation_line_id: r.quotation_line_id }));
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
      pageSize={pageSize}
      onPageChange={setPage}
      rows={rows()}
      rowKey={(row) => Number(row.quotation_line_id)}
      selected={selected()}
      onToggleRow={toggleRow}
      onToggleAll={toggleAll}
      onApply={confirm}
      columns={[
        { key: "date_no", header: "Date-No.", cell: (r) => String(r.date_no_display ?? "") },
        { key: "ref", header: "Quotation", cell: (r) => String(r.reference_no ?? "") },
        { key: "customer", header: "Customer", cell: (r) => String(r.customer_name ?? "") },
        { key: "item", header: "Item", cell: (r) => `${r.item_code ?? ""} ${r.item_name ?? ""}` },
        { key: "bal", header: "Balance", class: "text-right", cell: (r) => Number(r.balance_qty ?? 0) },
        { key: "price", header: "Unit", class: "text-right", cell: (r) => Number(r.unit_vat_inc ?? 0) },
      ]}
    />
  );
}
