import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { ActivityHistoryLink } from "../../shared/ActivityHistoryLink";
import { showBlockerResult } from "../../shared/handleSaveResult";
import { useTransactionListState } from "../../shared/useListState";
import { useToast } from "../../shared/toast";
import { uiLabel } from "../../shared/branding/uiLabel";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { StockEntryModal } from "./StockEntryModal";
import {
  LocationTransferModal,
  type LocationTransferDetail,
} from "./LocationTransferModal";

type TransferLineRow = {
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

type ListPayload = { rows: TransferLineRow[]; total: number };

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function StockEntriesPage() {
  const toast = useToast();
  const client = useQueryClient();
  const { page, setPage, q, setQ, sort, order, toggleSort, pageSize } = useTransactionListState("datetime", 25);
  const [createOpen, setCreateOpen] = createSignal(false);
  const [otherOpen, setOtherOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<LocationTransferDetail | null>(null);
  const [ledgerRow, setLedgerRow] = createSignal<TransferLineRow | null>(null);
  const [auditRow, setAuditRow] = createSignal<TransferLineRow | null>(null);
  const [auditAttachments, setAuditAttachments] = createSignal<
    Array<{ id: number; file_name: string; size_bytes: number }>
  >([]);
  const [postingId, setPostingId] = createSignal<number | null>(null);

  const list = createQuery(() => ({
    queryKey: ["stock-transfer-lines", page(), pageSize, q(), sort(), order()],
    queryFn: async () => {
      const qs = new URLSearchParams({
        page: String(page()),
        pageSize: String(pageSize),
        sort: sort(),
        order: order(),
      });
      if (q().trim()) qs.set("q", q().trim());
      const res = await apiFetch<ListPayload>(`/api/v1/inventory/stock-entries/transfer-lines?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load");
      return res.data ?? { rows: [], total: 0 };
    },
  }));

  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ["stock-transfer-lines"] });
    void client.invalidateQueries({ queryKey: ["stock-entries"] });
    void client.invalidateQueries({ queryKey: ["stock-movements"] });
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

  const openAudit = async (row: TransferLineRow) => {
    setAuditRow(row);
    const res = await apiFetch<Array<{ id: number; file_name: string; size_bytes: number }>>(
      `/api/v1/inventory/stock-entries/${row.stock_entry_id}/attachments`,
      {},
      { silent: true },
    );
    setAuditAttachments(res.success ? res.data ?? [] : []);
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
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold text-slate-900">Location Transfer</h1>
          <p class="mt-1 text-sm text-slate-600">
            Move stock between locations. Qty out and Qty in are the same item quantity; Serial/Lot is a tracking count.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-lg border border-stroke px-3 py-2 text-sm hover:bg-slate-50"
            onClick={() => setOtherOpen(true)}
          >
            Issue / Receipt
          </button>
          <button
            type="button"
            class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            onClick={() => {
              setEditing(null);
              setCreateOpen(true);
            }}
          >
            New transfer
          </button>
        </div>
      </div>

      <div class="flex flex-wrap items-end gap-3">
        <Field label="Search">
          <input
            class={inputClass}
            value={q()}
            placeholder="TR no, item, location, reason…"
            onInput={(e) => setQ(e.currentTarget.value)}
          />
        </Field>
      </div>

      <Show when={!list.isLoading} fallback={<p class="text-sm text-slate-500">{uiLabel("common.loading")}</p>}>
        <div class="overflow-x-auto rounded-lg border border-slate-200">
          <table class="min-w-full text-sm">
            <thead class="bg-brand-50 text-left text-xs font-semibold uppercase text-brand-700">
              <tr>
                <th class="cursor-pointer px-3 py-2" onClick={() => toggleSort("datetime")}>
                  Datetime {sort() === "datetime" ? (order() === "desc" ? "↓" : "↑") : ""}
                </th>
                <th class="px-3 py-2">TR No</th>
                <th class="px-3 py-2">Item</th>
                <th class="px-3 py-2">Location out</th>
                <th class="px-3 py-2 text-right">Qty out</th>
                <th class="px-3 py-2">Location in</th>
                <th class="px-3 py-2 text-right">Qty in</th>
                <th class="px-3 py-2 text-right">Serial/Lot</th>
                <th class="px-3 py-2">Transferred by</th>
                <th class="px-3 py-2">Reason</th>
                <th class="px-3 py-2">Status</th>
                <th class="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              <For each={list.data?.rows ?? []}>
                {(row) => (
                  <tr class="border-t border-slate-100 hover:bg-brand-50/30">
                    <td class="px-3 py-2 whitespace-nowrap">
                      <button
                        type="button"
                        class="text-left font-medium text-brand-700 hover:underline"
                        onClick={() => setLedgerRow(row)}
                      >
                        {formatWhen(row.datetime)}
                      </button>
                    </td>
                    <td class="px-3 py-2">
                      <button type="button" class="text-brand-700 hover:underline" onClick={() => void openEntry(row.stock_entry_id)}>
                        {row.entry_no}
                      </button>
                    </td>
                    <td class="px-3 py-2">
                      <button type="button" class="text-left hover:underline" onClick={() => void openEntry(row.stock_entry_id)}>
                        {row.item_code} — {row.item_name}
                      </button>
                    </td>
                    <td class="px-3 py-2">{row.from_location_name || "—"}</td>
                    <td class="px-3 py-2 text-right tabular-nums">{row.qty_out}</td>
                    <td class="px-3 py-2">{row.to_location_name || "—"}</td>
                    <td class="px-3 py-2 text-right tabular-nums">{row.qty_in}</td>
                    <td class="px-3 py-2 text-right tabular-nums text-text-secondary">
                      {row.serial_lot_count > 0 ? row.serial_lot_count : "—"}
                    </td>
                    <td class="px-3 py-2">
                      <button
                        type="button"
                        class="text-left text-brand-700 hover:underline"
                        onClick={() => void openAudit(row)}
                      >
                        {row.transferred_by_name || "—"}
                      </button>
                    </td>
                    <td class="max-w-[12rem] truncate px-3 py-2 text-text-secondary" title={row.reason}>
                      {row.reason || "—"}
                    </td>
                    <td class="px-3 py-2 capitalize">{row.status}</td>
                    <td class="px-3 py-2">
                      <div class="flex flex-wrap items-center gap-2">
                        <Show when={row.status === "draft"}>
                          <button
                            type="button"
                            class="text-brand-600 hover:underline disabled:opacity-50"
                            disabled={postingId() === row.stock_entry_id}
                            onClick={() => void postEntry(row)}
                          >
                            {postingId() === row.stock_entry_id ? "Posting…" : "Post"}
                          </button>
                        </Show>
                        <ActivityHistoryLink
                          module="inventory"
                          targetType="inv_stock_entry"
                          targetId={row.stock_entry_id}
                          title={`History — ${row.entry_no}`}
                        />
                      </div>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
          <Show when={(list.data?.rows.length ?? 0) === 0}>
            <p class="px-4 py-8 text-center text-sm text-text-secondary">No location transfers yet. Create one to move stock between branches.</p>
          </Show>
        </div>
        <Show when={(list.data?.total ?? 0) > pageSize}>
          <div class="flex items-center justify-end gap-2 text-sm">
            <button
              type="button"
              class="rounded border border-stroke px-3 py-1 disabled:opacity-40"
              disabled={page() <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span class="text-text-secondary">
              Page {page()} · {list.data?.total ?? 0} lines
            </span>
            <button
              type="button"
              class="rounded border border-stroke px-3 py-1 disabled:opacity-40"
              disabled={page() * pageSize >= (list.data?.total ?? 0)}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </Show>
      </Show>

      <LocationTransferModal
        open={createOpen()}
        editing={editing()}
        onClose={() => {
          setCreateOpen(false);
          setEditing(null);
        }}
        onSaved={invalidate}
      />

      <StockEntryModal
        open={otherOpen()}
        onClose={() => setOtherOpen(false)}
        onCreated={invalidate}
        autoPost={false}
      />

      <Show when={ledgerRow()}>
        {(row) => (
          <div class="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4" role="presentation">
            <div class="my-8 w-full max-w-4xl rounded-2xl border border-stroke bg-white shadow-xl" role="dialog" aria-modal="true">
              <div class="flex items-center justify-between border-b border-stroke px-5 py-4">
                <h2 class="text-lg font-semibold">Transfer ledger — {row().entry_no}</h2>
                <button type="button" class="rounded-lg border border-stroke px-3 py-1.5 text-sm" onClick={() => setLedgerRow(null)}>
                  Close
                </button>
              </div>
              <div class="overflow-x-auto px-5 py-4">
                <table class="min-w-full text-left text-sm">
                  <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
                    <tr>
                      <th class="px-3 py-2">Datetime</th>
                      <th class="px-3 py-2">Item</th>
                      <th class="px-3 py-2">Location out</th>
                      <th class="px-3 py-2 text-right">Qty out</th>
                      <th class="px-3 py-2">Location in</th>
                      <th class="px-3 py-2 text-right">Qty in</th>
                      <th class="px-3 py-2 text-right">Serial/Lot</th>
                      <th class="px-3 py-2">Remark</th>
                      <th class="px-3 py-2">Posted by</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr class="border-t border-stroke/60">
                      <td class="px-3 py-2">
                        <button
                          type="button"
                          class="text-brand-700 hover:underline"
                          onClick={() => {
                            const id = row().stock_entry_id;
                            setLedgerRow(null);
                            void openEntry(id);
                          }}
                        >
                          {formatWhen(row().datetime)}
                        </button>
                      </td>
                      <td class="px-3 py-2">
                        {row().item_code} — {row().item_name}
                      </td>
                      <td class="px-3 py-2">{row().from_location_name}</td>
                      <td class="px-3 py-2 text-right tabular-nums">{row().qty_out}</td>
                      <td class="px-3 py-2">{row().to_location_name}</td>
                      <td class="px-3 py-2 text-right tabular-nums">{row().qty_in}</td>
                      <td class="px-3 py-2 text-right tabular-nums">{row().serial_lot_count > 0 ? row().serial_lot_count : "—"}</td>
                      <td class="px-3 py-2 text-text-secondary">{row().remark || "—"}</td>
                      <td class="px-3 py-2">{row().approved_by_name || row().transferred_by_name || "—"}</td>
                    </tr>
                  </tbody>
                </table>
                <p class="mt-3 text-xs text-text-secondary">Qty out and Qty in are the same item quantity for this transfer line.</p>
              </div>
            </div>
          </div>
        )}
      </Show>

      <Show when={auditRow()}>
        {(row) => (
          <div class="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4" role="presentation">
            <div class="my-8 w-full max-w-lg rounded-2xl border border-stroke bg-white shadow-xl" role="dialog" aria-modal="true">
              <div class="flex items-center justify-between border-b border-stroke px-5 py-4">
                <h2 class="text-lg font-semibold">Transfer audit — {row().entry_no}</h2>
                <button
                  type="button"
                  class="rounded-lg border border-stroke px-3 py-1.5 text-sm"
                  onClick={() => {
                    setAuditRow(null);
                    setAuditAttachments([]);
                  }}
                >
                  Close
                </button>
              </div>
              <dl class="space-y-3 px-5 py-4 text-sm">
                <div>
                  <dt class="text-xs font-medium uppercase text-text-secondary">Requested by</dt>
                  <dd class="mt-0.5 font-medium">{row().requested_by_name || "—"}</dd>
                  <dd class="text-xs text-text-secondary">{row().requested_at ? formatWhen(row().requested_at) : "—"}</dd>
                </div>
                <div>
                  <dt class="text-xs font-medium uppercase text-text-secondary">Reason</dt>
                  <dd class="mt-0.5">{row().reason || "—"}</dd>
                  <Show when={row().remark}>
                    <dd class="text-xs text-text-secondary">Line: {row().remark}</dd>
                  </Show>
                </div>
                <div>
                  <dt class="text-xs font-medium uppercase text-text-secondary">Attachments</dt>
                  <Show when={auditAttachments().length > 0} fallback={<dd class="mt-0.5 text-text-secondary">None</dd>}>
                    <ul class="mt-1 space-y-1">
                      <For each={auditAttachments()}>
                        {(f) => (
                          <li class="text-text-primary">{f.file_name}</li>
                        )}
                      </For>
                    </ul>
                  </Show>
                </div>
                <div>
                  <dt class="text-xs font-medium uppercase text-text-secondary">Approved by</dt>
                  <dd class="mt-0.5 font-medium">{row().approved_by_name || "—"}</dd>
                  <dd class="text-xs text-text-secondary">{row().approved_at ? formatWhen(row().approved_at) : "Pending post"}</dd>
                </div>
              </dl>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}
