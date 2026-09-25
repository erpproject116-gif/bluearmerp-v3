import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { ActivityHistoryLink } from "../../shared/ActivityHistoryLink";
import { CollapsibleFilterPanel } from "../../shared/CollapsibleFilterPanel";
import { showBlockerResult } from "../../shared/handleSaveResult";
import { Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import { useTransactionListState } from "../../shared/useListState";
import { useToast } from "../../shared/toast";
import {
  LocationTransferModal,
  type LocationTransferDetail,
} from "./LocationTransferModal";

type TransferLineRow = {
  id: number;
  line_id: number;
  stock_entry_id: number;
  entry_no: string;
  datetime: string;
  item_id: number;
  item_code: string;
  item_name: string;
  from_location_name: string;
  to_location_name: string;
  qty_out: number;
  qty_in: number;
  serial_lot_count: number;
  transferred_by_name: string;
  requested_by_name: string;
  requested_at?: string | null;
  approved_by_name: string;
  approved_at?: string | null;
  reason: string;
  remark: string;
  status: string;
};

type ListPayload = { rows: Omit<TransferLineRow, "id">[]; total: number };

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
    case "posted":
      return "Posted";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

function statusClass(status: string) {
  switch (status) {
    case "draft":
      return "bg-slate-100 text-slate-700";
    case "posted":
      return "bg-emerald-50 text-emerald-800";
    case "cancelled":
      return "bg-red-50 text-red-700";
    default:
      return "bg-slate-50 text-text-secondary";
  }
}

export default function StockEntriesPage() {
  const toast = useToast();
  const client = useQueryClient();
  const { page, setPage, q, setQ, sort, order, toggleSort, pageSize, setPageSize } = useTransactionListState("datetime", 25);
  const [createOpen, setCreateOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<LocationTransferDetail | null>(null);
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [status, setStatus] = createSignal("");
  const [draftQ, setDraftQ] = createSignal("");
  const [postingId, setPostingId] = createSignal<number | null>(null);

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
    queryKey: ["stock-transfer-lines", page(), pageSize(), q(), sort(), order(), status()],
    queryFn: async () => {
      const qs = new URLSearchParams({
        page: String(page()),
        pageSize: String(pageSize()),
        sort: sort(),
        order: order(),
      });
      if (q().trim()) qs.set("q", q().trim());
      if (status().trim()) qs.set("status", status().trim());
      const res = await apiFetch<ListPayload>(`/api/v1/inventory/stock-entries/transfer-lines?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load");
      const data = res.data ?? { rows: [], total: 0 };
      return {
        total: data.total,
        rows: (data.rows ?? []).map((r) => ({ ...r, id: r.line_id })),
      };
    },
  }));

  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ["stock-transfer-lines"] });
    void client.invalidateQueries({ queryKey: ["stock-entries"] });
    void client.invalidateQueries({ queryKey: ["stock-movements"] });
  };

  const search = () => {
    setQ(draftQ().trim());
    setPage(1);
    invalidate();
  };

  const openNew = () => {
    setEditing(null);
    setCreateOpen(true);
  };

  const openEntry = async (id: number) => {
    const res = await apiFetch<LocationTransferDetail>(`/api/v1/inventory/stock-entries/${id}`);
    if (!res.success || !res.data) {
      showBlockerResult(res, toast, { fallbackTitle: "Couldn't open this transfer." });
      return;
    }
    setEditing(res.data);
    setCreateOpen(true);
  };

  const openRow = (row: TransferLineRow) => {
    setSelectedId(row.id);
    void openEntry(row.stock_entry_id);
  };

  const postEntry = async (row: TransferLineRow) => {
    if (row.status !== "draft") return;
    setPostingId(row.stock_entry_id);
    const res = await apiFetch(`/api/v1/inventory/stock-entries/${row.stock_entry_id}/post`, { method: "POST" });
    setPostingId(null);
    if (!res.success) {
      showBlockerResult(res, toast, { fallbackTitle: "Couldn't post this transfer." });
      return;
    }
    toast.success("Transfer posted.");
    invalidate();
  };

  return (
    <div class="space-y-4">
      <CollapsibleFilterPanel
        title="Location Transfer"
        description="Move stock between locations. Qty out and Qty in are the same item quantity; Serial/Lot is a tracking count. Press F8 to search."
      >
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Field label="Keyword">
            <input
              class={inputClass}
              value={draftQ()}
              onInput={(e) => setDraftQ(e.currentTarget.value)}
              placeholder="TR no, item, location, reason…"
            />
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
              <option value="posted">Posted</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </Field>
        </div>
      </CollapsibleFilterPanel>

      <SpreadsheetGrid<TransferLineRow>
        columns={[
          {
            key: "datetime",
            header: "Datetime",
            render: (r) => (
              <button
                type="button"
                class="text-left font-medium text-brand-700 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  openRow(r);
                }}
              >
                {formatWhen(r.datetime)}
              </button>
            ),
          },
          {
            key: "entry_no",
            header: "TR No",
            render: (r) => (
              <button
                type="button"
                class="text-brand-700 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  openRow(r);
                }}
              >
                {r.entry_no}
              </button>
            ),
          },
          {
            key: "item_code",
            header: "Item",
            render: (r) => `${r.item_code} — ${r.item_name}`,
          },
          { key: "from_location_name", header: "Location out", render: (r) => r.from_location_name || "—" },
          {
            key: "qty_out",
            header: "Qty out",
            render: (r) => formatQty(r.qty_out),
          },
          { key: "to_location_name", header: "Location in", render: (r) => r.to_location_name || "—" },
          {
            key: "qty_in",
            header: "Qty in",
            render: (r) => formatQty(r.qty_in),
          },
          {
            key: "serial_lot_count",
            header: "Serial/Lot",
            sortable: false,
            render: (r) => (r.serial_lot_count > 0 ? String(r.serial_lot_count) : "—"),
          },
          {
            key: "transferred_by_name",
            header: "Transferred by",
            sortable: false,
            render: (r) => r.transferred_by_name || "—",
          },
          { key: "reason", header: "Reason", render: (r) => r.reason || "—" },
          {
            key: "status",
            header: "Status",
            render: (r) => (
              <span class={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(r.status)}`}>
                {statusLabel(r.status)}
              </span>
            ),
          },
          {
            key: "actions",
            header: "Actions",
            sortable: false,
            hideable: false,
            render: (r) => (
              <div class="flex flex-wrap items-center gap-2">
                <Show when={r.status === "draft"}>
                  <button
                    type="button"
                    class="text-xs font-medium text-brand-700 hover:underline disabled:opacity-50"
                    disabled={postingId() === r.stock_entry_id}
                    onClick={(e) => {
                      e.stopPropagation();
                      void postEntry(r);
                    }}
                  >
                    {postingId() === r.stock_entry_id ? "Posting…" : "Post"}
                  </button>
                </Show>
                <button
                  type="button"
                  class="text-xs font-medium text-brand-700 hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    openRow(r);
                  }}
                >
                  {r.status === "draft" ? "Edit" : "View"}
                </button>
                <ActivityHistoryLink
                  module="inventory"
                  targetType="inv_stock_entry"
                  targetId={r.stock_entry_id}
                  title={`History — ${r.entry_no}`}
                />
              </div>
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
        codeKey="entry_no"
        nameKey="item_name"
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
        searchPlaceholder="Search TR no, item, location, reason…"
        onRefresh={invalidate}
        newLabel="New transfer"
      />

      <LocationTransferModal
        open={createOpen()}
        editing={editing()}
        onClose={() => {
          setCreateOpen(false);
          setEditing(null);
        }}
        onSaved={invalidate}
      />
    </div>
  );
}
