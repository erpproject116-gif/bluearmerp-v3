import { createSignal, Show } from "solid-js";
import { A } from "@solidjs/router";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { DateInput } from "../../shared/DateInput";
import { apiFetch } from "../../shared/api";
import { SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { useListState } from "../../shared/useListState";
import { StockAdjustmentModal } from "./StockAdjustmentModal";

export type StockAdjustmentRequestRow = {
  id: number;
  item_id: number;
  item_code: string;
  item_name: string;
  location_id: number;
  location_name: string;
  qty_before?: number | null;
  qty_delta: number;
  qty_after?: number | null;
  reason: string;
  status: string;
  created_by_name?: string;
  decided_by_name?: string;
  decided_at?: string | null;
  decision?: string;
  created_at: string;
  updated_at: string;
};

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatQty(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function statusLabel(status: string) {
  switch (status) {
    case "draft":
      return "Draft";
    case "e_approval":
      return "Pending approval";
    case "completed":
      return "Approved";
    case "rejected":
      return "Rejected";
    default:
      return status;
  }
}

function statusClass(status: string) {
  switch (status) {
    case "e_approval":
      return "bg-amber-50 text-amber-800";
    case "completed":
      return "bg-emerald-50 text-emerald-800";
    case "rejected":
      return "bg-red-50 text-red-700";
    case "draft":
      return "bg-slate-100 text-slate-700";
    default:
      return "bg-slate-50 text-text-secondary";
  }
}

function defaultDateRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 90);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

export default function StockAdjustmentsPage() {
  const qc = useQueryClient();
  const { page, setPage, q, setQ, sort, order, toggleSort, pageSize } = useListState("created_at", 25, {
    defaultOrder: "desc",
  });
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [adjustOpen, setAdjustOpen] = createSignal(false);
  const [editRequestId, setEditRequestId] = createSignal<number | null>(null);
  const [status, setStatus] = createSignal("");
  const initialDates = defaultDateRange();
  const [dateFrom, setDateFrom] = createSignal(initialDates.from);
  const [dateTo, setDateTo] = createSignal(initialDates.to);

  const list = createQuery(() => ({
    queryKey: ["stock-adjustment-requests", page(), sort(), order(), q(), status(), dateFrom(), dateTo()],
    queryFn: async () => {
      const qs = new URLSearchParams({
        page: String(page()),
        pageSize: String(pageSize),
        sort: sort(),
        order: order(),
      });
      if (q()) qs.set("q", q());
      if (status()) qs.set("status", status());
      if (dateFrom()) qs.set("date_from", dateFrom());
      if (dateTo()) qs.set("date_to", dateTo());
      const res = await apiFetch<StockAdjustmentRequestRow[]>(
        `/api/v1/inventory/stock-adjustment-requests?${qs}`,
      );
      if (!res.success) throw new Error(res.message ?? "Failed to load");
      return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
    },
  }));

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["stock-adjustment-requests"] });
    void qc.invalidateQueries({ queryKey: ["stock-movements"] });
  };

  const openNew = () => {
    setEditRequestId(null);
    setAdjustOpen(true);
  };

  const openRow = (row: StockAdjustmentRequestRow) => {
    setSelectedId(row.id);
    if (row.status === "draft") {
      setEditRequestId(row.id);
      setAdjustOpen(true);
    }
  };

  return (
    <>
      <div class="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <div class="w-full">
          <h2 class="text-base font-semibold text-text-primary">Stock adjustments</h2>
          <p class="mt-1 text-xs text-text-secondary">
            All quantity change requests by item and location (branch), with From → To comparison, who submitted,
            and who approved or rejected. Inventory updates only after an approver confirms. Pending items also
            appear in{" "}
            <A href="/app/dashboard/approvals" class="text-brand-700 hover:underline">
              Approvals
            </A>
            .
          </p>
        </div>
        <label class="text-sm">
          <span class="mb-1 block text-text-secondary">From</span>
          <DateInput
            class="rounded border border-stroke px-2 py-1.5 text-sm"
            value={dateFrom()}
            onInput={(e) => setDateFrom(e.currentTarget.value)}
          />
        </label>
        <label class="text-sm">
          <span class="mb-1 block text-text-secondary">To</span>
          <DateInput
            class="rounded border border-stroke px-2 py-1.5 text-sm"
            value={dateTo()}
            onInput={(e) => setDateTo(e.currentTarget.value)}
          />
        </label>
        <label class="text-sm">
          <span class="mb-1 block text-text-secondary">Status</span>
          <select
            class="rounded border border-stroke px-2 py-1.5 text-sm"
            value={status()}
            onChange={(e) => {
              setStatus(e.currentTarget.value);
              setPage(1);
            }}
          >
            <option value="">All</option>
            <option value="draft">Draft</option>
            <option value="e_approval">Pending approval</option>
            <option value="completed">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
        <button type="button" class="rounded-lg bg-brand px-4 py-2 text-sm text-white" onClick={invalidate}>
          Refresh
        </button>
        <button
          type="button"
          class="rounded-lg border border-stroke px-3 py-2 text-sm hover:bg-slate-50"
          onClick={() => {
            const d = defaultDateRange();
            setDateFrom(d.from);
            setDateTo(d.to);
            setStatus("");
            setQ("");
            setPage(1);
          }}
        >
          Reset to 90 days
        </button>
        <div class="ml-auto flex flex-wrap gap-2">
          <A
            href="/app/inventory/stock-movements"
            class="rounded-lg border border-stroke px-3 py-2 text-sm text-text-secondary hover:bg-slate-50"
          >
            Stock movements
          </A>
          <button type="button" class="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700" onClick={openNew}>
            New adjustment
          </button>
        </div>
      </div>

      <SpreadsheetGrid<StockAdjustmentRequestRow>
        columns={[
          { key: "created_at", header: "When", render: (r) => formatWhen(r.created_at) },
          { key: "item_code", header: "Item" },
          { key: "item_name", header: "Item name" },
          { key: "location_name", header: "Location / branch" },
          {
            key: "qty_before",
            header: "Qty from",
            sortable: false,
            render: (r) => formatQty(r.qty_before),
          },
          {
            key: "qty_delta",
            header: "Change",
            render: (r) => {
              const sign = r.qty_delta > 0 ? "+" : "";
              return `${sign}${formatQty(r.qty_delta)}`;
            },
          },
          {
            key: "qty_after",
            header: "Qty to",
            sortable: false,
            render: (r) => formatQty(r.qty_after),
          },
          {
            key: "status",
            header: "Status",
            render: (r) => (
              <span class={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(r.status)}`}>
                {statusLabel(r.status)}
              </span>
            ),
          },
          { key: "reason", header: "Reason", render: (r) => r.reason || "—" },
          {
            key: "created_by_name",
            header: "Submitted by",
            sortable: false,
            render: (r) => r.created_by_name || "—",
          },
          {
            key: "decided_by_name",
            header: "Approved / rejected by",
            sortable: false,
            render: (r) => {
              if (!r.decided_by_name) return "—";
              const verb = r.decision === "reject" ? "Rejected by" : r.decision === "approve" ? "Approved by" : "";
              return verb ? `${verb} ${r.decided_by_name}` : r.decided_by_name;
            },
          },
          {
            key: "decided_at",
            header: "Decided at",
            sortable: false,
            render: (r) => (r.decided_at ? formatWhen(r.decided_at) : "—"),
          },
          {
            key: "actions",
            header: "Open",
            sortable: false,
            render: (r) =>
              r.status === "draft" ? (
                <button
                  type="button"
                  class="text-xs font-medium text-brand-700 hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    openRow(r);
                  }}
                >
                  Edit draft
                </button>
              ) : r.status === "e_approval" ? (
                <A
                  href="/app/dashboard/approvals"
                  class="text-xs font-medium text-brand-700 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Approvals
                </A>
              ) : (
                <span class="text-xs text-text-secondary">—</span>
              ),
          },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={(id) => {
          setSelectedId(id);
          const row = (list.data?.rows ?? []).find((r) => r.id === id);
          if (row) openRow(row);
        }}
        onEdit={() => {
          const id = selectedId();
          const row = (list.data?.rows ?? []).find((r) => r.id === id);
          if (row) openRow(row);
        }}
        onNew={openNew}
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
        onSearchChange={(v) => {
          setQ(v);
          setPage(1);
        }}
        searchPlaceholder="Search item, location, reason, status…"
        onRefresh={invalidate}
        newLabel="New adjustment"
      />

      <Show when={!list.isFetching && (list.data?.total ?? 0) === 0}>
        <p class="mt-3 text-center text-sm text-text-secondary">
          No stock adjustment requests in this period. Create one with New adjustment, or widen the date range.
        </p>
      </Show>

      <StockAdjustmentModal
        open={adjustOpen()}
        requestId={editRequestId()}
        onClose={() => {
          setAdjustOpen(false);
          setEditRequestId(null);
        }}
        onSaved={invalidate}
      />
    </>
  );
}
