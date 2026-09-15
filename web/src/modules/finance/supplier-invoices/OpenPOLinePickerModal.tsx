import { createEffect, createMemo, createResource, createSignal, For, on } from "solid-js";
import { apiFetch } from "../../../shared/api";
import {
  OpenTransactionMonitor,
  buildOpenLineQuery,
  type OpenMonitorFilters,
} from "../../../shared/OpenTransactionMonitor";
import { openSlipDocStatusLabel } from "../../../shared/openSlipDocStatusLabel";
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

type StatusChip = "all" | "in_progress" | "finished";

const pageSize = 500;

function poChip(status: string, progress: string): StatusChip {
  const s = (status || "").toLowerCase();
  if (s === "received") return "finished";
  void progress;
  return "in_progress";
}

export function OpenPOLinePickerModal(props: Props) {
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
  const [statusChip, setStatusChip] = createSignal<StatusChip>("all");

  createEffect(
    on(
      () => props.open,
      (open) => {
        if (!open) return;
        setSelected(new Set<number>());
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
      const qs = buildOpenLineQuery({ page: p!.page, pageSize, filters: p!.filters });
      const res = await apiFetch<OpenPOLine[]>(`/api/v1/finance/supplier-invoices/open-po-lines?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load purchase order lines");
      return { rows: res.data ?? [], total: res.meta?.total ?? (res.data?.length ?? 0) };
    },
  );

  const filteredRows = createMemo(() => {
    const list = data()?.rows ?? [];
    const chip = statusChip();
    if (chip === "all") return list;
    return list.filter((r) => poChip(String(r.status ?? ""), String(r.progress_status ?? "")) === chip);
  });

  const rows = () => filteredRows() as unknown as Record<string, unknown>[];

  const toggleRow = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const list = filteredRows();
    if (selected().size === list.length) setSelected(new Set<number>());
    else setSelected(new Set(list.map((r) => r.purchase_order_line_id)));
  };

  const apply = () => {
    const list = filteredRows();
    const picked = list.filter((r) => selected().has(r.purchase_order_line_id));
    if (picked.length === 0) return;
    props.onConfirm(picked);
    props.onClose();
    setSelected(new Set<number>());
  };

  const chips: { id: StatusChip; label: string }[] = [
    { id: "all", label: "All" },
    { id: "in_progress", label: "In Progress" },
    { id: "finished", label: "Finished" },
  ];

  return (
    <OpenTransactionMonitor
      title={props.mapOnly ? "Map from Purchase Order — open lines" : "Load Slip (from Purchase Order) — open lines"}
      open={props.open}
      onClose={props.onClose}
      filters={filters()}
      onFiltersChange={setFilters}
      loading={data.loading}
      error={data.error}
      total={filteredRows().length}
      page={page()}
      pageSize={pageSize}
      onPageChange={setPage}
      rows={rows()}
      rowKey={(row) => Number(row.purchase_order_line_id)}
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
      emptyHint="No open Purchase Order lines with unbilled qty. Finished POs appear when bill residual remains. Clear filters and try All."
    />
  );
}
