import { For, Show, createMemo, createSignal } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { A, useNavigate } from "@solidjs/router";
import { apiFetch } from "../../shared/api";
import { uiLabel } from "../../shared/branding/uiLabel";
import { SpreadsheetGrid, type Column } from "../../shared/SpreadsheetGrid";
import { StockAdjustmentModal } from "./StockAdjustmentModal";

type ReconciliationCategory = {
  code: string;
  label: string;
  count: number;
  api: string;
};

type Summary = {
  total_count: number;
  categories: ReconciliationCategory[];
};

type ReconRow = Record<string, unknown> & { id: number };

function withRowIds(rows: Record<string, unknown>[], page: number, pageSize: number): ReconRow[] {
  return rows.map((r, i) => {
    const existing = typeof r.id === "number" ? r.id : undefined;
    const fallback =
      typeof r.context_id === "number"
        ? (r.context_id as number)
        : typeof r.sales_order_line_id === "number"
          ? (r.sales_order_line_id as number)
          : typeof r.goods_receipt_line_id === "number"
            ? (r.goods_receipt_line_id as number)
            : typeof r.supplier_invoice_id === "number"
              ? (r.supplier_invoice_id as number)
              : page * pageSize + i + 1;
    return { ...r, id: existing ?? fallback };
  });
}

function num(v: unknown): string {
  if (typeof v === "number") return String(v);
  if (v == null) return "—";
  return String(v);
}

function str(v: unknown): string {
  if (v == null || v === "") return "—";
  return String(v);
}

export default function StockReconciliationPage() {
  const navigate = useNavigate();
  const [expanded, setExpanded] = createSignal<string | null>(null);
  const [page, setPage] = createSignal(1);
  const pageSize = 25;
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [adjustOpen, setAdjustOpen] = createSignal(false);
  const [adjustItemId, setAdjustItemId] = createSignal<number | null>(null);
  const [adjustItemLabel, setAdjustItemLabel] = createSignal("");

  const summary = createQuery(() => ({
    queryKey: ["reconciliation-summary"],
    queryFn: async () => {
      const res = await apiFetch<Summary>("/api/v1/inventory/reconciliation/summary");
      if (!res.success) throw new Error(res.message ?? "Failed to load");
      return res.data ?? { total_count: 0, categories: [] };
    },
  }));

  const activeCat = createMemo(() => {
    const code = expanded();
    if (!code) return null;
    return (summary.data?.categories ?? []).find((c) => c.code === code) ?? null;
  });

  const detail = createQuery(() => {
    const cat = activeCat();
    return {
      queryKey: ["reconciliation-detail", cat?.api, page()],
      enabled: Boolean(cat),
      queryFn: async () => {
        if (!cat) return { rows: [] as Record<string, unknown>[], total: 0 };
        const qs = new URLSearchParams({ page: String(page()), pageSize: String(pageSize) });
        const res = await apiFetch<Record<string, unknown>[]>(
          `/api/v1/inventory/reconciliation/${cat.api}?${qs}`,
        );
        if (!res.success) throw new Error(res.message ?? "Failed to load details");
        const rows = Array.isArray(res.data) ? res.data : [];
        const total = res.meta?.total ?? rows.length;
        return { rows, total };
      },
    };
  });

  const loadCategory = (cat: ReconciliationCategory) => {
    if (expanded() === cat.code) {
      setExpanded(null);
      setSelectedId(null);
      return;
    }
    setPage(1);
    setSelectedId(null);
    setExpanded(cat.code);
  };

  const openAdjust = (itemId: number | null | undefined, code: string, name: string) => {
    if (!itemId) return;
    setAdjustItemId(itemId);
    setAdjustItemLabel(`${code} — ${name}`);
    setAdjustOpen(true);
  };

  const columnsFor = (code: string): Column<ReconRow>[] => {
    switch (code) {
      case "serial_qty_mismatch":
        return [
          {
            key: "document_label",
            header: "Document",
            clickable: true,
            render: (r) => str(r.document_label || r.document_no),
          },
          { key: "context_label", header: "Type", render: (r) => str(r.context_label) },
          { key: "item_code", header: "Item code" },
          { key: "item_name", header: "Item name" },
          { key: "expected_qty", header: "Expected", render: (r) => num(r.expected_qty) },
          { key: "serial_count", header: "Serials attached", render: (r) => num(r.serial_count) },
          { key: "gap_qty", header: "Gap", render: (r) => num(r.gap_qty) },
        ];
      case "reserved_stale":
        return [
          { key: "serial_no", header: "Serial", clickable: true },
          { key: "item_code", header: "Item code" },
          { key: "item_name", header: "Item name" },
          { key: "location_name", header: "Location", render: (r) => str(r.location_name) },
          {
            key: "reserved_at",
            header: "Reserved since",
            render: (r) => {
              const raw = str(r.reserved_at);
              if (raw === "—") return raw;
              try {
                return new Date(raw).toLocaleString();
              } catch {
                return raw;
              }
            },
          },
          { key: "days_stale", header: "Days stale", render: (r) => num(r.days_stale) },
          { key: "sales_order_no", header: "SO no.", render: (r) => str(r.sales_order_no) },
        ];
      case "so_release_gap":
        return [
          { key: "sales_order_no", header: "SO no.", clickable: true },
          { key: "customer_name", header: "Customer" },
          { key: "item_code", header: "Item code" },
          { key: "item_name", header: "Item name" },
          { key: "order_qty", header: "Order qty", render: (r) => num(r.order_qty) },
          { key: "released_qty", header: "Released", render: (r) => num(r.released_qty) },
          { key: "gap_qty", header: "Gap", render: (r) => num(r.gap_qty) },
        ];
      case "gr_serial_gap":
        return [
          {
            key: "document_label",
            header: "GR / Reference",
            clickable: true,
            render: (r) => str(r.document_label || `GR #${r.goods_receipt_id}`),
          },
          { key: "line_no", header: "Line", render: (r) => num(r.line_no) },
          { key: "item_code", header: "Item code" },
          { key: "item_name", header: "Item name" },
          { key: "expected_qty", header: "Expected", render: (r) => num(r.expected_qty) },
          { key: "received_qty", header: "Received", render: (r) => num(r.received_qty) },
          { key: "serial_count", header: "Serials", render: (r) => num(r.serial_count) },
          { key: "gap_qty", header: "Gap", render: (r) => num(r.gap_qty) },
        ];
      case "reserve_without_dr":
        return [
          { key: "sales_order_no", header: "SO no.", clickable: true },
          { key: "customer_name", header: "Customer" },
          { key: "item_code", header: "Item code" },
          { key: "item_name", header: "Item name" },
          { key: "released_qty", header: "Released", render: (r) => num(r.released_qty) },
          { key: "delivered_qty", header: "Delivered", render: (r) => num(r.delivered_qty) },
          { key: "gap_qty", header: "Gap", render: (r) => num(r.gap_qty) },
        ];
      case "dr_without_invoice":
        return [
          { key: "sales_order_no", header: "SO no.", clickable: true },
          { key: "customer_name", header: "Customer" },
          { key: "item_code", header: "Item code" },
          { key: "item_name", header: "Item name" },
          { key: "delivered_qty", header: "Delivered", render: (r) => num(r.delivered_qty) },
          { key: "invoiced_qty", header: "Invoiced", render: (r) => num(r.invoiced_qty) },
          { key: "gap_qty", header: "Gap", render: (r) => num(r.gap_qty) },
        ];
      case "gr_without_supplier_invoice":
        return [
          { key: "purchase_order_no", header: "PO no.", clickable: true },
          { key: "vendor_name", header: "Vendor" },
          {
            key: "goods_receipt_id",
            header: "GR",
            render: (r) => (r.goods_receipt_id != null ? `GR #${r.goods_receipt_id}` : "—"),
          },
          { key: "item_code", header: "Item code" },
          { key: "item_name", header: "Item name" },
          { key: "received_qty", header: "Received", render: (r) => num(r.received_qty) },
          { key: "billed_qty", header: "Billed", render: (r) => num(r.billed_qty) },
          { key: "gap_qty", header: "Gap", render: (r) => num(r.gap_qty) },
        ];
      case "ap_over_application":
        return [
          { key: "invoice_no", header: "Invoice no.", clickable: true },
          { key: "vendor_name", header: "Vendor" },
          { key: "grand_total", header: "Total", render: (r) => num(r.grand_total) },
          { key: "applied_amount", header: "Applied", render: (r) => num(r.applied_amount) },
          { key: "over_amount", header: "Over", render: (r) => num(r.over_amount) },
        ];
      default:
        return [
          { key: "item_code", header: "Item code" },
          { key: "item_name", header: "Item name" },
        ];
    }
  };

  const onRowOpen = (row: ReconRow) => {
    const code = expanded();
    if (!code) return;
    if (code === "serial_qty_mismatch") {
      if (row.context_type === "sales_line" && typeof row.parent_id === "number") {
        navigate(`/app/sales/sales?highlight=${row.parent_id}`);
        return;
      }
      if (row.context_type === "release_line" && typeof row.parent_id === "number") {
        navigate(`/app/sales-order/sales-orders?highlight=${row.parent_id}`);
        return;
      }
      openAdjust(
        typeof row.item_id === "number" ? row.item_id : null,
        str(row.item_code),
        str(row.item_name),
      );
      return;
    }
    if (code === "reserved_stale") {
      if (typeof row.sales_order_id === "number") {
        navigate(`/app/sales-order/sales-orders?highlight=${row.sales_order_id}`);
        return;
      }
      navigate("/app/inventory/serial-lot/receive");
      return;
    }
    if (
      code === "so_release_gap" ||
      code === "reserve_without_dr" ||
      code === "dr_without_invoice"
    ) {
      if (typeof row.sales_order_id === "number") {
        navigate(`/app/sales-order/sales-orders?highlight=${row.sales_order_id}`);
      }
      return;
    }
    if (code === "gr_serial_gap" || code === "gr_without_supplier_invoice") {
      navigate("/app/purchase-order/goods-receipt");
      return;
    }
    if (code === "ap_over_application" && typeof row.supplier_invoice_id === "number") {
      navigate(`/app/purchases/supplier-invoices?highlight=${row.supplier_invoice_id}`);
    }
  };

  const gridRows = () => withRowIds(detail.data?.rows ?? [], page(), pageSize);

  return (
    <div class="space-y-4">
      <div>
        <h1 class="text-xl font-semibold text-slate-900">Stock Reconciliation</h1>
        <p class="mt-1 text-sm text-slate-600">
          Find mismatches between stock, serials, sales orders, goods receipts, and bills. Open a category to see a
          clear table, then open the related document or fix stock.
        </p>
        <p class="mt-1 text-xs text-slate-500">
          Related:{" "}
          <A href="/app/inventory/stock-movements" class="text-brand-700 hover:underline">
            Stock movements / adjustments
          </A>
          {" · "}
          <A href="/app/inventory/serial-lot/reports/reconciliation" class="text-brand-700 hover:underline">
            Serial balance report
          </A>
        </p>
      </div>

      <Show when={!summary.isLoading} fallback={<p class="text-sm text-slate-500">{uiLabel("common.loading")}</p>}>
        <div class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p class="text-sm text-slate-700">
            Issues found:{" "}
            <strong class={summary.data?.total_count ? "text-red-700" : "text-emerald-700"}>
              {summary.data?.total_count ?? 0}
            </strong>
          </p>
        </div>

        <ul class="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white shadow-sm">
          <For each={summary.data?.categories ?? []}>
            {(cat) => (
              <li>
                <button
                  type="button"
                  class="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-slate-50"
                  onClick={() => loadCategory(cat)}
                >
                  <span class="font-medium text-slate-800">{cat.label}</span>
                  <span class={cat.count > 0 ? "font-semibold text-red-700" : "text-slate-500"}>{cat.count}</span>
                </button>
                <Show when={expanded() === cat.code}>
                  <div class="border-t border-slate-100 bg-slate-50 px-2 py-3 sm:px-4">
                    <Show when={detail.isFetching && !(detail.data?.rows?.length)} fallback={
                      <Show
                        when={(detail.data?.rows?.length ?? 0) > 0}
                        fallback={
                          <p class="px-2 text-sm text-slate-500">No issues in this category right now.</p>
                        }
                      >
                        <div class="mb-2 flex flex-wrap gap-2 px-1">
                          <Show when={cat.code === "serial_qty_mismatch" || cat.code === "gr_serial_gap"}>
                            <button
                              type="button"
                              class="rounded-lg border border-stroke bg-white px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
                              onClick={() => navigate("/app/inventory/serial-lot/receive")}
                            >
                              Fix serials
                            </button>
                          </Show>
                          <button
                            type="button"
                            class="rounded-lg border border-stroke bg-white px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-slate-50"
                            onClick={() => {
                              const row = gridRows().find((r) => r.id === selectedId());
                              if (row && typeof row.item_id === "number") {
                                openAdjust(row.item_id, str(row.item_code), str(row.item_name));
                              } else {
                                setAdjustItemId(null);
                                setAdjustItemLabel("");
                                setAdjustOpen(true);
                              }
                            }}
                          >
                            Adjust stock
                          </button>
                        </div>
                        <SpreadsheetGrid<ReconRow>
                          columns={columnsFor(cat.code)}
                          rows={gridRows()}
                          loading={detail.isFetching}
                          selectedId={selectedId()}
                          onSelect={setSelectedId}
                          codeKey="item_code"
                          nameKey="item_name"
                          page={page()}
                          pageSize={pageSize}
                          total={detail.data?.total ?? 0}
                          onPageChange={setPage}
                          onRefresh={() => void detail.refetch()}
                          onNew={() => {}}
                          onEdit={onRowOpen}
                          showNew={false}
                          columnPrefsKey={`recon-${cat.code}`}
                        />
                      </Show>
                    }>
                      <p class="px-2 text-sm text-slate-500">Loading details…</p>
                    </Show>
                  </div>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </Show>

      <StockAdjustmentModal
        open={adjustOpen()}
        onClose={() => setAdjustOpen(false)}
        onSaved={() => {
          void summary.refetch();
          void detail.refetch();
        }}
        initialItemId={adjustItemId()}
        initialItemLabel={adjustItemLabel()}
      />
    </div>
  );
}
