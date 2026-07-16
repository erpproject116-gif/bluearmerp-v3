import { createSignal } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { DateInput } from "../../shared/DateInput";
import { apiFetch } from "../../shared/api";
import { SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { ActivityHistoryLink } from "../../shared/ActivityHistoryLink";
import { useListState } from "../../shared/useListState";
import { StockAdjustmentModal } from "./StockAdjustmentModal";

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

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function StockMovementsPage() {
  const qc = useQueryClient();
  const { page, setPage, q, setQ, sort, order, toggleSort, pageSize } = useListState("created_at", 25, { defaultOrder: "desc" });
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [adjustOpen, setAdjustOpen] = createSignal(false);
  const [movementType, setMovementType] = createSignal("");
  const [dateFrom, setDateFrom] = createSignal("");
  const [dateTo, setDateTo] = createSignal("");

  const list = createQuery(() => ({
    queryKey: ["stock-movements", page(), sort(), order(), q(), movementType(), dateFrom(), dateTo()],
    queryFn: async () => {
      const qs = new URLSearchParams({
        page: String(page()),
        pageSize: String(pageSize),
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

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["stock-movements"] });

  return (
    <>
      <div class="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <label class="text-sm">
          <span class="mb-1 block text-text-secondary">From</span>
          <DateInput class="rounded border border-stroke px-2 py-1.5 text-sm" value={dateFrom()} onInput={(e) => setDateFrom(e.currentTarget.value)} />
        </label>
        <label class="text-sm">
          <span class="mb-1 block text-text-secondary">To</span>
          <DateInput class="rounded border border-stroke px-2 py-1.5 text-sm" value={dateTo()} onInput={(e) => setDateTo(e.currentTarget.value)} />
        </label>
        <label class="text-sm">
          <span class="mb-1 block text-text-secondary">Movement type</span>
          <select class="rounded border border-stroke px-2 py-1.5 text-sm" value={movementType()} onChange={(e) => setMovementType(e.currentTarget.value)}>
            <option value="">All</option>
            <option value="adjustment">Adjustment</option>
            <option value="so_release">SO Release</option>
          </select>
        </label>
        <button type="button" class="rounded-lg bg-brand px-4 py-2 text-sm text-white" onClick={invalidate}>
          Apply filters
        </button>
        <button type="button" class="ml-auto rounded-lg border border-stroke px-4 py-2 text-sm hover:bg-slate-50" onClick={() => setAdjustOpen(true)}>
          Stock adjustment
        </button>
      </div>

      <SpreadsheetGrid
        columns={[
          { key: "created_at", header: "When", render: (r) => formatWhen(r.created_at) },
          { key: "item_code", header: "Item Code" },
          { key: "item_name", header: "Item Name" },
          { key: "location_name", header: "Location" },
          { key: "qty_delta", header: "Qty Δ", render: (r) => r.qty_delta.toFixed(4) },
          { key: "movement_type", header: "Type" },
          { key: "reason", header: "Reason", render: (r) => r.reason ?? "" },
          {
            key: "history",
            header: "History",
            sortable: false,
            render: (r) => <ActivityHistoryLink module="inventory" targetType="inv_stock_movement" targetId={r.id} />,
          },
        ]}
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
        pageSize={pageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        search={q()}
        onSearchChange={setQ}
        searchPlaceholder="Search not applied to movements — use filters"
        onRefresh={invalidate}
      />

      <StockAdjustmentModal open={adjustOpen()} onClose={() => setAdjustOpen(false)} onSaved={invalidate} />
    </>
  );
}
