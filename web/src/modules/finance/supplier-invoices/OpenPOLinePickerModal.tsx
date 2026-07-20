import { createEffect, createResource, createSignal } from "solid-js";
import { apiFetch } from "../../../shared/api";
import {
  OpenTransactionMonitor,
  buildOpenLineQuery,
  defaultMonitorDates,
  type OpenMonitorFilters,
} from "../../../shared/OpenTransactionMonitor";
import type { OpenPOLine } from "../../../shared/useSupplierInvoiceList";

type Props = {
  open: boolean;
  partnerId?: number | null;
  partnerLabel?: string;
  onClose: () => void;
  onConfirm: (lines: OpenPOLine[]) => void;
  /** When true, apply does not require a header vendor — for cross-module map. */
  mapOnly?: boolean;
};

const pageSize = 50;

export function OpenPOLinePickerModal(props: Props) {
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
  const [selected, setSelected] = createSignal(new Set<number>());

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
      const res = await apiFetch<OpenPOLine[]>(`/api/v1/finance/supplier-invoices/open-po-lines?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load purchase order lines");
      return { rows: res.data ?? [], total: res.meta?.total ?? (res.data?.length ?? 0) };
    },
  );

  const rows = () => (data()?.rows ?? []) as unknown as Record<string, unknown>[];

  const toggleRow = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const list = data()?.rows ?? [];
    if (selected().size === list.length) setSelected(new Set());
    else setSelected(new Set(list.map((r) => r.purchase_order_line_id)));
  };

  const apply = () => {
    const list = data()?.rows ?? [];
    const picked = list.filter((r) => selected().has(r.purchase_order_line_id));
    if (picked.length === 0) return;
    props.onConfirm(picked);
    props.onClose();
    setSelected(new Set());
  };

  return (
    <OpenTransactionMonitor
      title={props.mapOnly ? "Map from Purchase Order — open lines" : "Load Slip (from Purchase Order) — open lines"}
      open={props.open}
      onClose={props.onClose}
      filters={filters()}
      onFiltersChange={setFilters}
      loading={data.loading}
      error={data.error}
      total={data()?.total ?? 0}
      page={page()}
      pageSize={pageSize}
      onPageChange={setPage}
      rows={rows()}
      rowKey={(row) => Number(row.purchase_order_line_id)}
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
          key: "item",
          header: "Item",
          cell: (r) => `${r.item_code ?? ""} — ${r.item_name ?? ""}`,
        },
        {
          key: "ordered",
          header: "Ordered",
          class: "text-right",
          cell: (r) => Number(r.ordered_qty ?? 0),
        },
        {
          key: "balance",
          header: "Balance",
          class: "text-right",
          cell: (r) => Number(r.balance_qty ?? 0),
        },
        {
          key: "unit",
          header: "Unit (VAT inc.)",
          class: "text-right",
          cell: (r) => Number(r.unit_vat_inc ?? 0),
        },
      ]}
      onApply={apply}
      applyLabel={props.mapOnly ? "Map selected lines" : undefined}
      emptyHint="No open PO lines for these filters. Clear dates or show all partners."
    />
  );
}
