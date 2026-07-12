import { createSignal, For, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { inputClass } from "../../../shared/SpreadsheetGrid";
import { SALES_ORDER_SETTINGS_HREF } from "../../../shared/entityTypes";
import { SerialLineCell } from "../../../shared/SerialLineCell";
import { useListState } from "../../../shared/useListState";
import {
  postSalesOrderReleases,
  undoSalesOrderRelease,
  useInvalidateReleaseQueue,
  useRecentReleases,
  useReleaseQueue,
  type ReleaseQueueRow,
  type RecentReleaseRow,
} from "../../../shared/useReleaseQueue";
import { useToast } from "../../../shared/toast";
import { hasPermission, useAuth } from "../../../shared/auth-context";
import { SalesOrderLayout } from "../SalesOrderLayout";
import { progressStatusLabel } from "./progressStatus";

export default function ReleaseSalesOrderPage() {
  const auth = useAuth();
  const canUndo = () => hasPermission(auth.me, "sales_order.release_undo", "write");
  const toast = useToast();
  const navigate = useNavigate();
  const invalidate = useInvalidateReleaseQueue();
  const { page, setPage, q, setQ, sort, order, pageSize } = useListState("order_date", 25, { defaultOrder: "desc" });
  const [releaseQty, setReleaseQty] = createSignal<Record<number, string>>({});
  const [serialIds, setSerialIds] = createSignal<Record<number, number[]>>({});
  const [serialLabels, setSerialLabels] = createSignal<Record<number, string>>({});
  const [submitting, setSubmitting] = createSignal(false);
  const [undoingId, setUndoingId] = createSignal<number | null>(null);

  const recent = useRecentReleases(canUndo);

  const queue = useReleaseQueue(() => ({
    page: page(),
    pageSize,
    sort: sort(),
    order: order(),
    q: q() || undefined,
  }));

  const setQty = (lineId: number, value: string) => {
    setReleaseQty((prev) => ({ ...prev, [lineId]: value }));
  };

  const releaseSelected = async () => {
    const rows = queue.data?.rows ?? [];
    const lines = rows
      .map((row) => {
        const qty = Number(releaseQty()[row.sales_order_line_id] ?? "");
        if (!Number.isFinite(qty) || qty <= 0) return null;
        const ids = serialIds()[row.sales_order_line_id];
        return {
          sales_order_line_id: row.sales_order_line_id,
          release_qty: qty,
          ...(ids?.length ? { serial_unit_ids: ids } : {}),
        };
      })
      .filter((ln) => ln != null);

    if (lines.length === 0) {
      toast.warning("Enter release quantity for at least one line.");
      return;
    }

    setSubmitting(true);
    const res = await postSalesOrderReleases(lines);
    setSubmitting(false);

    if (!res.success) {
      toast.warning(res.message ?? "Failed to release.");
      return;
    }

    toast.success(res.message ?? `Released ${res.data?.released_count ?? lines.length} line(s).`);
    setReleaseQty({});
    setSerialIds({});
    setSerialLabels({});
    invalidate();

    const soId = res.data?.sales_order_ids?.[0];
    if (soId) {
      navigate(`/app/sales-order/delivery-receipts/new?sales_order_id=${soId}`);
    }
  };

  const releaseQtyFor = (row: ReleaseQueueRow) => {
    const raw = releaseQty()[row.sales_order_line_id];
    if (raw) return Number(raw);
    return row.balance_qty;
  };

  const fillBalance = (row: ReleaseQueueRow) => {
    setQty(row.sales_order_line_id, String(row.balance_qty));
  };

  const undoRelease = async (row: RecentReleaseRow) => {
    const label = `${row.sales_order_no} · ${row.item_code}`;
    if (!window.confirm(`Undo release of ${row.release_qty} for ${label}?`)) return;
    setUndoingId(row.release_line_id);
    const res = await undoSalesOrderRelease(row.release_line_id);
    setUndoingId(null);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to undo release.");
      return;
    }
    toast.success(res.message ?? "Release undone.");
    invalidate();
    void recent.refetch();
  };

  const totalPages = () => Math.max(1, Math.ceil((queue.data?.total ?? 0) / pageSize));

  return (
    <SalesOrderLayout>
      <section class="rounded-xl border border-stroke bg-white shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-stroke px-5 py-4">
          <div>
            <p class="text-sm text-text-secondary">Enter release quantities for lines with balance.</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <input
              class={`${inputClass} w-56`}
              placeholder="Search SO, customer, item…"
              value={q()}
              onInput={(e) => {
                setQ(e.currentTarget.value);
                setPage(1);
              }}
            />
            <a href={SALES_ORDER_SETTINGS_HREF.salesOrder} class="text-sm text-brand-600 hover:underline" title="Settings">
              Settings
            </a>
            <button type="button" class="rounded border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50" onClick={() => invalidate()}>
              Refresh
            </button>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="erp-grid min-w-full text-left text-sm">
            <thead class="bg-slate-50 text-xs font-semibold uppercase text-text-secondary">
              <tr>
                <th class="px-3 py-2">Date-No.</th>
                <th class="px-3 py-2">Sales Order No.</th>
                <th class="px-3 py-2">Progress</th>
                <th class="px-3 py-2">Customer</th>
                <th class="px-3 py-2">Location</th>
                <th class="px-3 py-2">Item</th>
                <th class="px-3 py-2 text-right">Order Qty</th>
                <th class="px-3 py-2 text-right">Released</th>
                <th class="px-3 py-2 text-right">Delivered</th>
                <th class="px-3 py-2 text-right">Remaining</th>
                <th class="px-3 py-2 text-right">Pick balance</th>
                <th class="px-3 py-2 text-right">Loc. Stock</th>
                <th class="px-3 py-2 text-right">Release Qty</th>
                <th class="px-3 py-2">Serials</th>
              </tr>
            </thead>
            <tbody>
              <Show when={queue.isFetching}>
                <tr>
                  <td colSpan={13} class="px-3 py-8 text-center text-text-secondary">
                    Loading…
                  </td>
                </tr>
              </Show>
              <Show when={!queue.isFetching && (queue.data?.rows ?? []).length === 0}>
                <tr>
                  <td colSpan={13} class="px-3 py-8 text-center text-text-secondary">
                    No lines in the release queue.
                  </td>
                </tr>
              </Show>
              <For each={queue.data?.rows ?? []}>
                {(row) => (
                  <tr class="border-t border-stroke/60 hover:bg-slate-50/50">
                    <td class="px-3 py-2">{row.date_no_display}</td>
                    <td class="px-3 py-2">{row.sales_order_no}</td>
                    <td class="px-3 py-2">{progressStatusLabel(row.progress_status)}</td>
                    <td class="px-3 py-2">{row.customer_name}</td>
                    <td class="px-3 py-2">{row.location_name}</td>
                    <td class="px-3 py-2">
                      {row.item_code} — {row.item_name}
                    </td>
                    <td class="px-3 py-2 text-right">{row.order_qty}</td>
                    <td class="px-3 py-2 text-right">{row.released_qty}</td>
                    <td class="px-3 py-2 text-right">{row.delivered_qty}</td>
                    <td class="px-3 py-2 text-right">{row.remaining_qty}</td>
                    <td class="px-3 py-2 text-right">
                      <button type="button" class="text-brand-600 hover:underline" onClick={() => fillBalance(row)} title="Fill balance">
                        {row.balance_qty}
                      </button>
                    </td>
                    <td class="px-3 py-2 text-right">{row.location_stock}</td>
                    <td class="px-3 py-2 text-right">
                      <input
                        type="number"
                        class={`${inputClass} w-24 text-right`}
                        min="0"
                        max={row.balance_qty}
                        value={releaseQty()[row.sales_order_line_id] ?? ""}
                        onInput={(e) => setQty(row.sales_order_line_id, e.currentTarget.value)}
                      />
                    </td>
                    <td class="px-3 py-2">
                      <Show when={row.track_serial}>
                        <SerialLineCell
                          mode="units"
                          itemId={row.item_id}
                          itemCode={row.item_code}
                          itemName={row.item_name}
                          locationId={row.location_id}
                          qty={releaseQtyFor(row)}
                          serialUnitIds={serialIds()[row.sales_order_line_id] ?? []}
                          serialLabels={serialLabels()[row.sales_order_line_id]}
                          context="release"
                          onChange={(ids, labels, qty) => {
                            setSerialIds((prev) => ({ ...prev, [row.sales_order_line_id]: ids }));
                            setSerialLabels((prev) => ({ ...prev, [row.sales_order_line_id]: labels }));
                            if (qty) setQty(row.sales_order_line_id, qty);
                          }}
                        />
                      </Show>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3 border-t border-stroke px-5 py-3">
          <div class="flex gap-2 text-xs text-text-secondary">
            <button type="button" class="rounded border border-stroke px-2 py-1 disabled:opacity-40" disabled={page() <= 1} onClick={() => setPage(page() - 1)}>
              Prev
            </button>
            <span>
              Page {page()} of {totalPages()}
            </span>
            <button type="button" class="rounded border border-stroke px-2 py-1 disabled:opacity-40" disabled={page() >= totalPages()} onClick={() => setPage(page() + 1)}>
              Next
            </button>
          </div>
          <button
            type="button"
            class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            disabled={submitting()}
            onClick={() => void releaseSelected()}
          >
            Release
          </button>
        </div>
      </section>

      <Show when={canUndo()}>
        <section class="mt-6 rounded-xl border border-stroke bg-white shadow-sm">
          <div class="border-b border-stroke px-5 py-4">
            <h3 class="text-base font-semibold text-text-primary">Recent releases</h3>
            <p class="text-sm text-text-secondary">Undo a release when nothing has been invoiced from it yet.</p>
          </div>
          <div class="overflow-x-auto">
            <table class="erp-grid min-w-full text-left text-sm">
              <thead class="bg-slate-50 text-xs font-semibold uppercase text-text-secondary">
                <tr>
                  <th class="px-3 py-2">Sales order</th>
                  <th class="px-3 py-2">Customer</th>
                  <th class="px-3 py-2">Item</th>
                  <th class="px-3 py-2 text-right">Qty</th>
                  <th class="px-3 py-2">Released</th>
                  <th class="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                <Show when={recent.isFetching}>
                  <tr>
                    <td colSpan={6} class="px-3 py-6 text-center text-text-secondary">
                      Loading…
                    </td>
                  </tr>
                </Show>
                <Show when={!recent.isFetching && (recent.data ?? []).length === 0}>
                  <tr>
                    <td colSpan={6} class="px-3 py-6 text-center text-text-secondary">
                      No release lines yet.
                    </td>
                  </tr>
                </Show>
                <For each={recent.data ?? []}>
                  {(row) => (
                    <tr class="border-t border-stroke/60">
                      <td class="px-3 py-2">{row.sales_order_no}</td>
                      <td class="px-3 py-2">{row.customer_name}</td>
                      <td class="px-3 py-2">
                        {row.item_code} — {row.item_name}
                      </td>
                      <td class="px-3 py-2 text-right">{row.release_qty}</td>
                      <td class="px-3 py-2">{row.release_date}</td>
                      <td class="px-3 py-2 text-right">
                        <button
                          type="button"
                          class="text-xs text-amber-700 hover:underline disabled:opacity-50"
                          disabled={undoingId() === row.release_line_id}
                          onClick={() => void undoRelease(row)}
                        >
                          {undoingId() === row.release_line_id ? "Undoing…" : "Undo"}
                        </button>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </section>
      </Show>

    </SalesOrderLayout>
  );
}
