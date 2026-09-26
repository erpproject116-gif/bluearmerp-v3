import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { DateInput } from "../../shared/DateInput";
import { apiFetch } from "../../shared/api";
import { CollapsibleFilterPanel } from "../../shared/CollapsibleFilterPanel";
import { Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import { ActivityHistoryLink } from "../../shared/ActivityHistoryLink";
import { useListState } from "../../shared/useListState";
import { applyColumnLabels, listViewKey, useColumnLabelSettings } from "../../shared/useColumnLabelSettings";
import { StockAdjustmentModal } from "./StockAdjustmentModal";
import { InvBookLedgerModal, type InvBookLedgerTarget } from "./reports/InvBookLedgerModal";

export type StockMovementRow = {
  id: number;
  item_id: number;
  item_code: string;
  item_name: string;
  location_id: number;
  location_name: string;
  qty_delta: number;
  movement_type: string;
  ref_type: string;
  ref_id: number;
  reason?: string | null;
  created_at: string;
};

/** Map movement source refs to audit target types that actually write audit_logs. */
function auditTargetForMovement(
  refType: string,
  refId: number,
  movementId: number,
): { targetType: string; targetId: number } | null {
  if (!Number.isFinite(refId) || refId <= 0) return null;
  switch (refType) {
    case "sa_sales":
    case "pos_checkout":
      return { targetType: "sa_sales", targetId: refId };
    case "goods_receipt":
      return { targetType: "gr_goods_receipt", targetId: refId };
    case "stock_entry":
      return { targetType: "inv_stock_entry", targetId: refId };
    case "mfg_work_order":
      return { targetType: "mfg_work_order", targetId: refId };
    case "stock_adjustment":
      // Older rows stored the movement id in ref_id. Those have no request to open.
      if (refId === movementId) return null;
      return { targetType: "inv_stock_adjustment_request", targetId: refId };
    default:
      return null;
  }
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function defaultDateRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 90);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

export default function StockMovementsPage() {
  const listCols = useColumnLabelSettings(listViewKey("inv_stock_movement"));
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const { page, setPage, q, setQ, sort, order, toggleSort, pageSize, setPageSize } = useListState("created_at", 25, { defaultOrder: "desc" });
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [ledgerRow, setLedgerRow] = createSignal<InvBookLedgerTarget | null>(null);
  const [adjustOpen, setAdjustOpen] = createSignal(false);
  const [movementType, setMovementType] = createSignal("");
  const [draftQ, setDraftQ] = createSignal("");
  const initialDates = defaultDateRange();
  const [dateFrom, setDateFrom] = createSignal(initialDates.from);
  const [dateTo, setDateTo] = createSignal(initialDates.to);

  onMount(() => {
    const urlQ = searchParams.q;
    if (typeof urlQ === "string" && urlQ.trim()) {
      setQ(urlQ.trim());
      setDraftQ(urlQ.trim());
    } else {
      setDraftQ(q());
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F8") {
        e.preventDefault();
        search();
      }
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  const list = createQuery(() => ({
    queryKey: ["stock-movements", page(), sort(), order(), q(), movementType(), dateFrom(), dateTo()],
    queryFn: async () => {
      const qs = new URLSearchParams({
        page: String(page()),
        pageSize: String(pageSize()),
        sort: sort(),
        order: order(),
      });
      if (q()) qs.set("q", q());
      if (movementType()) qs.set("movement_type", movementType());
      if (dateFrom()) qs.set("date_from", dateFrom());
      if (dateTo()) qs.set("date_to", dateTo());
      const res = await apiFetch<StockMovementRow[]>(`/api/v1/inventory/stock-movements?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load");
      return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
    },
  }));

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["stock-movements"] });
    void qc.invalidateQueries({ queryKey: ["stock-entries"] });
  };

  const search = () => {
    setQ(draftQ().trim());
    setPage(1);
    invalidate();
  };

  return (
    <div class="space-y-4">
      <CollapsibleFilterPanel
        title="Stock Movements"
        description="Showing the last 90 days by default. Clear dates to see all history. Movements appear after Purchases (auto-receive), Purchase Receive, Stock Entry, Sales, or adjustments. Press F8 to search."
      >
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Field label="Keyword">
            <input
              class={inputClass}
              value={draftQ()}
              onInput={(e) => setDraftQ(e.currentTarget.value)}
              placeholder="Item, location, type, reason…"
            />
          </Field>
          <Field label="From">
            <DateInput class={inputClass} value={dateFrom()} onInput={(e) => setDateFrom(e.currentTarget.value)} />
          </Field>
          <Field label="To">
            <DateInput class={inputClass} value={dateTo()} onInput={(e) => setDateTo(e.currentTarget.value)} />
          </Field>
          <Field label="Movement type">
            <select class={inputClass} value={movementType()} onChange={(e) => setMovementType(e.currentTarget.value)}>
              <option value="">All</option>
              <option value="adjustment">Adjustment</option>
              <option value="so_release">SO Release</option>
              <option value="sales">Sales</option>
              <option value="goods_receipt">Purchase Receive</option>
              <option value="transfer_in">Transfer in</option>
              <option value="transfer_out">Transfer out</option>
              <option value="issue">Issue</option>
              <option value="receipt">Receipt</option>
              <option value="internal_use">Internal use</option>
              <option value="product_defect">Product defect</option>
            </select>
          </Field>
        </div>
      </CollapsibleFilterPanel>

      <SpreadsheetGrid
        columns={applyColumnLabels([
          { key: "created_at", header: "When", render: (r) => formatWhen(r.created_at) },
          {
            key: "item_code",
            header: "Item Code",
            clickable: false,
            render: (r) => (
              <button
                type="button"
                class="text-left font-medium text-brand-600 underline-offset-2 hover:text-brand-700 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  setLedgerRow({ item_id: r.item_id, item_code: r.item_code, item_name: r.item_name });
                }}
              >
                {r.item_code}
              </button>
            ),
          },
          { key: "item_name", header: "Item Name" },
          { key: "location_name", header: "Location", clickable: false },
          { key: "qty_delta", header: "Qty Δ", render: (r) => r.qty_delta.toFixed(4) },
          { key: "movement_type", header: "Type" },
          { key: "reason", header: "Reason", render: (r) => r.reason ?? "" },
          {
            key: "history",
            header: "History",
            sortable: false,
            render: (r) => {
              const target = auditTargetForMovement(r.ref_type, r.ref_id, r.id);
              if (!target) return null;
              return (
                <ActivityHistoryLink
                  module="inventory"
                  targetType={target.targetType}
                  targetId={target.targetId}
                />
              );
            },
          },
        ], listCols.columnLabel).filter((c) => listCols.isColumnVisible(c.key))}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={() => {}}
        onNew={() => setAdjustOpen(true)}
        codeKey="item_code"
        nameKey="location_name"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        page={page()}
        pageSize={pageSize()} onPageSizeChange={setPageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        search={q()}
        onSearchChange={(v) => {
          setQ(v);
          setDraftQ(v);
          setPage(1);
        }}
        searchPlaceholder="Search item, location, type, reason…"
        onRefresh={invalidate}
      />
      <Show when={!list.isFetching && (list.data?.total ?? 0) === 0}>
        <p class="mt-3 text-center text-sm text-text-secondary">
          No movements in this period — try Stock Entry, Bills, Purchase Receive, or Sales. Widen or clear the date range.
        </p>
      </Show>

      <StockAdjustmentModal open={adjustOpen()} onClose={() => setAdjustOpen(false)} onSaved={invalidate} />
      <InvBookLedgerModal
        open={ledgerRow() != null}
        row={ledgerRow()}
        period={{ date_from: dateFrom(), date_to: dateTo() }}
        onClose={() => setLedgerRow(null)}
      />
    </div>
  );
}
