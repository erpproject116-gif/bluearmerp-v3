import { createResource, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { inputClass } from "../../shared/SpreadsheetGrid";
import { modalDismissClass } from "../../shared/Modal";
import { LoadingText } from "../../shared/LoadingText";
import { openSlipDocStatusLabel } from "../../shared/openSlipDocStatusLabel";

export type OpenShippingSlipLineRow = {
  shipping_order_id: number;
  shipping_no: string;
  shipping_date: string;
  status?: string;
  sales_order_id: number;
  sales_order_line_id: number;
  date_no_display: string;
  sales_order_no: string;
  sales_order_status?: string;
  customer_name: string;
  location_id: number;
  location_name: string;
  partner_id: number;
  tax_type_id: number;
  currency_id: number;
  pic_name: string;
  item_id?: number | null;
  item_code: string;
  item_name: string;
  description?: string | null;
  balance_qty: number;
  unit_vat_inc: number;
  remark?: string | null;
  track_serial?: boolean;
};

export type PickedShippingSlipLine = OpenShippingSlipLineRow & {
  source_sales_order_line_id: number;
};

type Props = {
  open: boolean;
  partnerId?: number | null;
  onClose: () => void;
  onConfirm: (lines: PickedShippingSlipLine[]) => void;
};

async function fetchOpenLines(q: string, page: number, pageSize: number) {
  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort: "shipping_date", order: "desc" });
  if (q) qs.set("q", q);
  // Default: all partners' open shipping lines (form partner is optional filter only via search).
  const res = await apiFetch<OpenShippingSlipLineRow[]>(`/api/v1/shipping/orders/open-sales-lines?${qs}`);
  if (!res.success) throw new Error(res.message ?? "Failed to load shipping order lines");
  return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
}

export function ShippingOrderLinePickerModal(props: Props) {
  const [q, setQ] = createSignal("");
  const [page, setPage] = createSignal(1);
  const [selected, setSelected] = createSignal<Set<number>>(new Set());
  const pageSize = 500;

  const [data] = createResource(
    () => (props.open ? { q: q(), page: page() } : null),
    async (p) => fetchOpenLines(p!.q, p!.page, pageSize),
  );

  const toggleRow = (lineId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  };

  const confirm = () => {
    const rows = data()?.rows ?? [];
    const picked = rows
      .filter((r) => selected().has(r.sales_order_line_id))
      .map((r) => ({ ...r, source_sales_order_line_id: r.sales_order_line_id }));
    if (picked.length === 0) return;
    props.onConfirm(picked);
    props.onClose();
    setSelected(new Set<number>());
  };

  const totalPages = () => Math.max(1, Math.ceil((data()?.total ?? 0) / pageSize));

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:items-center">
        <div class="w-full max-w-5xl rounded-2xl border border-stroke bg-white shadow-xl">
          <div class="flex items-center justify-between border-b border-stroke px-5 py-3">
            <h2 class="text-lg font-semibold text-text-primary">Load Slip (Shipping Order) — billable SO lines</h2>
            <button type="button" class={modalDismissClass} onClick={() => props.onClose()}>
              Close
            </button>
          </div>

          <div class="border-b border-stroke px-5 py-3">
            <input
              class={inputClass}
              placeholder="Search shipping no, SO, customer, item…"
              value={q()}
              onInput={(e) => {
                setQ(e.currentTarget.value);
                setPage(1);
              }}
            />
          </div>

          <div class="max-h-[50vh] overflow-auto p-5">
            <Show when={data.loading}>
              <LoadingText class="text-sm text-text-secondary" as="p" />
            </Show>
            <Show when={data.error}>
              <p class="text-sm text-red-600">{String(data.error)}</p>
            </Show>
            <Show when={data()}>
              {(payload) => (
                <>
                  <table class="erp-grid min-w-full text-sm">
                    <thead>
                      <tr class="border-b border-stroke text-left text-xs uppercase text-text-secondary">
                        <th class="w-10 py-2 pr-2" />
                        <th class="py-2 pr-4">Shipping</th>
                        <th class="py-2 pr-4">Ship status</th>
                        <th class="py-2 pr-4">Sales Order</th>
                        <th class="py-2 pr-4">SO status</th>
                        <th class="py-2 pr-4">Customer</th>
                        <th class="py-2 pr-4">Item</th>
                        <th class="py-2 text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={payload().rows}>
                        {(row) => (
                          <tr
                            class="cursor-pointer border-b border-stroke/60 hover:bg-brand-50"
                            onDblClick={() => toggleRow(row.sales_order_line_id)}
                          >
                            <td class="py-2 pr-2">
                              <input
                                type="checkbox"
                                checked={selected().has(row.sales_order_line_id)}
                                onChange={() => toggleRow(row.sales_order_line_id)}
                              />
                            </td>
                            <td class="py-2 pr-4">{row.shipping_no}</td>
                            <td class="py-2 pr-4">{openSlipDocStatusLabel(row.status)}</td>
                            <td class="py-2 pr-4">{row.sales_order_no}</td>
                            <td class="py-2 pr-4">{openSlipDocStatusLabel(row.sales_order_status)}</td>
                            <td class="py-2 pr-4">{row.customer_name}</td>
                            <td class="py-2 pr-4">
                              {row.item_code} — {row.item_name}
                            </td>
                            <td class="py-2 text-right">{row.balance_qty}</td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                  <div class="mt-4 flex justify-between text-sm text-text-secondary">
                    <span>
                      Page {page()} of {totalPages()}
                    </span>
                    <div class="flex gap-2">
                      <button type="button" class="rounded border border-stroke px-3 py-1" disabled={page() <= 1} onClick={() => setPage((p) => p - 1)}>
                        Prev
                      </button>
                      <button type="button" class="rounded border border-stroke px-3 py-1" disabled={page() >= totalPages()} onClick={() => setPage((p) => p + 1)}>
                        Next
                      </button>
                    </div>
                  </div>
                </>
              )}
            </Show>
          </div>

          <div class="flex justify-end gap-2 border-t border-stroke px-5 py-3">
            <button type="button" class="rounded border border-stroke px-4 py-2 text-sm" onClick={() => props.onClose()}>
              Cancel
            </button>
            <button type="button" class="rounded bg-brand-600 px-4 py-2 text-sm text-white" onClick={confirm}>
              Apply selected
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
