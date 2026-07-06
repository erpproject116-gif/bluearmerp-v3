import { createSignal, For, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { inputClass } from "../../../shared/SpreadsheetGrid";
import { SALES_ORDER_SETTINGS_HREF } from "../../../shared/entityTypes";
import { SerialPickModal } from "../../../shared/SerialPickModal";
import { SerialSaleScanner } from "../../../shared/SerialSaleScanner";
import { useListState } from "../../../shared/useListState";
import {
  postSalesOrderReleases,
  useInvalidateReleaseQueue,
  useReleaseQueue,
  type ReleaseQueueRow,
} from "../../../shared/useReleaseQueue";
import { useToast } from "../../../shared/toast";
import { SalesOrderLayout } from "../SalesOrderLayout";
import { progressStatusLabel } from "./progressStatus";

export default function ReleaseSalesOrderPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const invalidate = useInvalidateReleaseQueue();
  const { page, setPage, q, setQ, sort, order, pageSize } = useListState("order_date", 25, { defaultOrder: "desc" });
  const [releaseQty, setReleaseQty] = createSignal<Record<number, string>>({});
  const [serialIds, setSerialIds] = createSignal<Record<number, number[]>>({});
  const [serialPickOpen, setSerialPickOpen] = createSignal(false);
  const [serialPickRow, setSerialPickRow] = createSignal<ReleaseQueueRow | null>(null);
  const [submitting, setSubmitting] = createSignal(false);

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
    invalidate();

    const soId = res.data?.sales_order_ids?.[0];
    if (soId) {
      navigate(`/app/sales-order/delivery-receipts/new?sales_order_id=${soId}`);
    }
  };

  const openSerialPick = (row: ReleaseQueueRow) => {
    setSerialPickRow(row);
    setSerialPickOpen(true);
  };

  const serialPickQty = () => {
    const row = serialPickRow();
    if (!row) return 1;
    const qty = Number(releaseQty()[row.sales_order_line_id] ?? row.balance_qty);
    return Math.max(1, Math.floor(qty));
  };

  const fillBalance = (row: ReleaseQueueRow) => {
    setQty(row.sales_order_line_id, String(row.balance_qty));
  };

  const totalPages = () => Math.max(1, Math.ceil((queue.data?.total ?? 0) / pageSize));

  return (
    <SalesOrderLayout>
      <section class="rounded-xl border border-stroke bg-white shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-stroke px-5 py-4">
          <div>
            <h2 class="text-lg font-semibold text-text-primary">Release Sales Order</h2>
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
                        <div class="max-w-[12rem] space-y-1">
                          <SerialSaleScanner
                            itemId={row.item_id}
                            locationId={row.location_id}
                            serialUnitIds={serialIds()[row.sales_order_line_id] ?? []}
                            context="release"
                            onChange={(ids) => {
                              setSerialIds((prev) => ({ ...prev, [row.sales_order_line_id]: ids }));
                              setQty(row.sales_order_line_id, String(ids.length));
                            }}
                          />
                          <button
                            type="button"
                            class="text-xs text-brand-600 hover:underline"
                            onClick={() => openSerialPick(row)}
                          >
                            Pick list
                          </button>
                        </div>
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

      <SerialPickModal
        open={serialPickOpen()}
        itemId={serialPickRow()?.item_id ?? null}
        locationId={serialPickRow()?.location_id}
        maxQty={serialPickQty()}
        selectedIds={serialIds()[serialPickRow()?.sales_order_line_id ?? 0] ?? []}
        itemLabel={
          serialPickRow()
            ? `${serialPickRow()!.item_code} — ${serialPickRow()!.item_name}`
            : undefined
        }
        onClose={() => setSerialPickOpen(false)}
        onConfirm={(ids) => {
          const row = serialPickRow();
          if (!row) return;
          setSerialIds((prev) => ({ ...prev, [row.sales_order_line_id]: ids }));
          toast.success(`Selected ${ids.length} serial(s).`);
        }}
      />
    </SalesOrderLayout>
  );
}
