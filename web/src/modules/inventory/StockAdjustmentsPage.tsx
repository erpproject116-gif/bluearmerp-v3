import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { A } from "@solidjs/router";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { DateInput } from "../../shared/DateInput";
import { apiFetch } from "../../shared/api";
import { CollapsibleFilterPanel } from "../../shared/CollapsibleFilterPanel";
import { Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
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
  line_count?: number;
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
  const [draftQ, setDraftQ] = createSignal("");
  const initialDates = defaultDateRange();
  const [dateFrom, setDateFrom] = createSignal(initialDates.from);
  const [dateTo, setDateTo] = createSignal(initialDates.to);

  onMount(() => {
    setDraftQ(q());
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

  const search = () => {
    setQ(draftQ().trim());
    setPage(1);
    invalidate();
  };

  const reset = () => {
    const d = defaultDateRange();
    setDateFrom(d.from);
    setDateTo(d.to);
    setStatus("");
    setDraftQ("");
    setQ("");
    setPage(1);
  };

  const clearDates = () => {
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  const openNew = () => {
    setEditRequestId(null);
    setAdjustOpen(true);
  };

  const openRow = (row: StockAdjustmentRequestRow) => {
    setSelectedId(row.id);
    setEditRequestId(row.id);
    setAdjustOpen(true);
  };

  return (
    <div class="space-y-4">
      <CollapsibleFilterPanel
        title="Stock adjustments"
        description="Quantity change requests by item and location. Stock updates only after approval. Pending items also appear in Approvals. Default range is the last 90 days — clear dates to see all. Search (F8)."
        actions={
          <>
            <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700" onClick={search}>
              Search (F8)
            </button>
            <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm text-text-secondary hover:bg-slate-50" onClick={reset}>
              Reset to 90 days
            </button>
            <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm text-text-secondary hover:bg-slate-50" onClick={clearDates}>
              All dates
            </button>
            <A
              href="/app/dashboard/approvals"
              class="rounded-lg border border-stroke px-3 py-2 text-sm text-text-secondary hover:bg-slate-50"
            >
              Approvals
            </A>
            <A
              href="/app/inventory/items"
              class="rounded-lg border border-stroke px-3 py-2 text-sm text-text-secondary hover:bg-slate-50"
            >
              Items
            </A>
            <A
              href="/app/inventory/stock-movements"
              class="rounded-lg border border-stroke px-3 py-2 text-sm text-text-secondary hover:bg-slate-50"
            >
              Stock movements
            </A>
            <button type="button" class="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700" onClick={openNew}>
              New adjustment
            </button>
          </>
        }
      >
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Field label="Keyword">
            <input
              class={inputClass}
              value={draftQ()}
              onInput={(e) => setDraftQ(e.currentTarget.value)}
              placeholder="Item, location, reason, status…"
            />
          </Field>
          <Field label="From">
            <DateInput class={inputClass} value={dateFrom()} onInput={(e) => setDateFrom(e.currentTarget.value)} />
          </Field>
          <Field label="To">
            <DateInput class={inputClass} value={dateTo()} onInput={(e) => setDateTo(e.currentTarget.value)} />
          </Field>
          <Field label="Status">
            <select
              class={inputClass}
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
          </Field>
        </div>
      </CollapsibleFilterPanel>

      <SpreadsheetGrid<StockAdjustmentRequestRow>
        columns={[
          { key: "created_at", header: "When", render: (r) => formatWhen(r.created_at) },
          { key: "item_code", header: "Item", render: (r) => (r.line_count && r.line_count > 1 ? `${r.item_code} (+${r.line_count - 1})` : r.item_code) },
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
            render: (r) => (
              <button
                type="button"
                class="text-xs font-medium text-brand-700 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  openRow(r);
                }}
              >
                {r.status === "draft" ? "Edit draft" : "View"}
              </button>
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
          setDraftQ(v);
          setPage(1);
        }}
        searchPlaceholder="Search item, location, reason, status…"
        onRefresh={invalidate}
        newLabel="New adjustment"
      />

      <Show when={!list.isFetching && (list.data?.total ?? 0) === 0}>
        <div class="mt-4 rounded-xl border border-dashed border-stroke bg-slate-50/80 px-6 py-8 text-center">
          <p class="text-sm font-medium text-text-primary">No stock adjustment requests in this view</p>
          <p class="mx-auto mt-2 max-w-lg text-sm text-text-secondary">
            The list defaults to the last 90 days. Use <span class="font-medium">All dates</span> if older requests
            exist, or create a new request. You can also check items on the Items page and click Stock adjustment to
            pre-fill lines.
          </p>
          <div class="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              onClick={openNew}
            >
              New adjustment
            </button>
            <button
              type="button"
              class="rounded-lg border border-stroke px-4 py-2 text-sm text-text-secondary hover:bg-white"
              onClick={clearDates}
            >
              All dates
            </button>
            <A
              href="/app/inventory/items"
              class="rounded-lg border border-stroke px-4 py-2 text-sm text-text-secondary hover:bg-white"
            >
              Open Items
            </A>
          </div>
        </div>
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
    </div>
  );
}
