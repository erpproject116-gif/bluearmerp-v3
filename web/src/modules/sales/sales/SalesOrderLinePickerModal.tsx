import { createEffect, createResource, createSignal } from "solid-js";
import { apiFetch } from "../../../shared/api";
import {
  OpenTransactionMonitor,
  buildOpenLineQuery,
  type OpenMonitorFilters,
} from "../../../shared/OpenTransactionMonitor";
import { openSlipSalesOrderStatusLabel } from "../../../shared/openSlipDocStatusLabel";

export type OpenSalesOrderLineRow = {
  sales_order_id: number;
  sales_order_line_id: number;
  date_no_display: string;
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
  payment_terms?: string;
  notes?: string;
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

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (lines: PickedSalesOrderLine[]) => void;
  partnerId?: number | null;
  partnerLabel?: string;
};

const pageSize = 500;

export function SalesOrderLinePickerModal(props: Props) {
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

  createEffect(() => {
    if (!props.open) return;
    setSelected(new Set<number>());
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
  });

  const [data] = createResource(
    () => (props.open ? { filters: filters(), page: page() } : null),
    async (p) => {
      const qs = buildOpenLineQuery({ page: p!.page, pageSize, filters: p!.filters });
      const res = await apiFetch<OpenSalesOrderLineRow[]>(`/api/v1/sales/sales-order-lines/open?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load sales order lines");
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
    else setSelected(new Set<number>(list.map((r) => r.sales_order_line_id)));
  };

  const confirm = () => {
    const list = data()?.rows ?? [];
    const picked = list
      .filter((r) => selected().has(r.sales_order_line_id))
      .map((r) => ({ ...r, source_sales_order_line_id: r.sales_order_line_id }));
    if (picked.length === 0) return;
    props.onConfirm(picked);
    props.onClose();
    setSelected(new Set<number>());
  };

  return (
    <OpenTransactionMonitor
      open={props.open}
      onClose={props.onClose}
      title="Load Slip — Sales Order (open lines)"
      filters={filters()}
      onFiltersChange={setFilters}
      loading={data.loading}
      error={data.error}
      total={data()?.total ?? 0}
      page={page()}
      pageSize={pageSize}
      onPageChange={setPage}
      rows={rows()}
      rowKey={(row) => Number(row.sales_order_line_id)}
      selected={selected()}
      onToggleRow={toggleRow}
      onToggleAll={toggleAll}
      onApply={confirm}
      emptyHint="No Completed Sales Order lines with open quantity. Set the SO Progress to Completed on Sales Orders first (Confirm / In progress is not enough). Fully invoiced lines are hidden. Serial-tracked items may still need Pick List release on Save. Check your user data scope includes that customer."
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
        { key: "item", header: "Item", cell: (r) => `${r.item_code ?? ""} ${r.item_name ?? ""}` },
        { key: "bal", header: "Balance", class: "text-right", cell: (r) => Number(r.balance_qty ?? 0) },
        { key: "uom", header: "UoM", cell: (r) => String(r.unit_code ?? "") },
        { key: "price", header: "Unit price", class: "text-right", cell: (r) => Number(r.unit_vat_inc ?? 0) },
        { key: "loc", header: "Location", cell: (r) => String(r.location_name ?? "") },
      ]}
    />
  );
}
