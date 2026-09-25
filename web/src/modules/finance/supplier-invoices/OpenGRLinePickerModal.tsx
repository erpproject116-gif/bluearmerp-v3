import { createEffect, createResource, createSignal, on } from "solid-js";
import { apiFetch } from "../../../shared/api";
import {
  OpenTransactionMonitor,
  buildOpenLineQuery,
  type OpenMonitorFilters,
} from "../../../shared/OpenTransactionMonitor";
import type { OpenGRLine } from "../../../shared/useSupplierInvoiceList";

type Props = {
  open: boolean;
  partnerId?: number | null;
  partnerLabel?: string;
  onClose: () => void;
  onConfirm: (lines: OpenGRLine[]) => void;
  mapOnly?: boolean;
};

const [pageSize, setPageSize] = createSignal(20);

export function OpenGRLinePickerModal(props: Props) {
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

  createEffect(
    on(
      () => props.open,
      (open) => {
        if (!open) return;
        setSelected(new Set<number>());
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
      const res = await apiFetch<OpenGRLine[]>(`/api/v1/finance/supplier-invoices/open-gr-lines?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load goods receipt lines");
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
    if (selected().size === list.length) setSelected(new Set<number>());
    else setSelected(new Set(list.map((r) => r.goods_receipt_line_id)));
  };

  const apply = () => {
    const list = data()?.rows ?? [];
    const picked = list.filter((r) => selected().has(r.goods_receipt_line_id));
    if (picked.length === 0) return;
    props.onConfirm(picked);
    props.onClose();
    setSelected(new Set<number>());
  };

  return (
    <OpenTransactionMonitor
      title={props.mapOnly ? "Map from Purchase Receive — open lines" : "Load Slip (from Purchase Receive) — open lines"}
      open={props.open}
      onClose={props.onClose}
      filters={filters()}
      onFiltersChange={setFilters}
      loading={data.loading}
      error={data.error}
      total={data()?.total ?? 0}
      page={page()}
      pageSize={pageSize()} onPageSizeChange={setPageSize}
      onPageChange={setPage}
      rows={rows()}
      rowKey={(row) => Number(row.goods_receipt_line_id)}
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
      emptyHint="No open GR lines with remaining qty. Clear date/vendor filters, or confirm goods were received and not already fully purchased."
    />
  );
}
