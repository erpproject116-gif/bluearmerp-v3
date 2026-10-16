import { PageSizeSelect } from "../../shared/pageSize";
import { createResource, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { inputClass } from "../../shared/SpreadsheetGrid";
import { modalDismissClass } from "../../shared/Modal";
import { LoadingText } from "../../shared/LoadingText";
import { openSlipDocStatusLabel } from "../../shared/openSlipDocStatusLabel";
import { SlipNestedLines } from "../../shared/SlipNestedLines";
import { checkedDocumentLines, slipLineSummary } from "../../shared/slipDocument";
import { useToast } from "../../shared/toast";

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

type OpenShippingDocument = {
  shipping_order_id: number;
  shipping_no: string;
  shipping_date: string;
  status?: string;
  customer_name: string;
  open_line_count: number;
  source_line_count: number;
  skipped_no_item_count: number;
  lines: OpenShippingSlipLineRow[];
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
  const res = await apiFetch<OpenShippingDocument[]>(`/api/v1/shipping/orders/open-sales-lines?${qs}`);
  if (!res.success) throw new Error(res.message ?? "Failed to load shipping order lines");
  return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
}

export function ShippingOrderLinePickerModal(props: Props) {
  const toast = useToast();
  const [q, setQ] = createSignal("");
  const [page, setPage] = createSignal(1);
  const [selected, setSelected] = createSignal<Set<number>>(new Set());
  const [unchecked, setUnchecked] = createSignal<Set<number>>(new Set());
  const [pageSize, setPageSize] = createSignal(20);

  const [data] = createResource(
    () => (props.open ? { q: q(), page: page() } : null),
    async (p) => fetchOpenLines(p!.q, p!.page, pageSize()),
  );

  const toggleRow = (docId: number) => {
    const doc = (data()?.rows ?? []).find((d) => d.shipping_order_id === docId);
    setUnchecked((prev) => {
      const next = new Set(prev);
      for (const line of doc?.lines ?? []) next.delete(line.sales_order_line_id);
      return next;
    });
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const toggleLine = (docId: number, lineId: number) => {
    const doc = (data()?.rows ?? []).find((d) => d.shipping_order_id === docId);
    const ids = (doc?.lines ?? []).map((line) => line.sales_order_line_id);
    setUnchecked((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      const anyChecked = ids.some((id) => !next.has(id));
      setSelected((selectedIds) => {
        const nextDocs = new Set(selectedIds);
        if (anyChecked) nextDocs.add(docId);
        else nextDocs.delete(docId);
        return nextDocs;
      });
      return next;
    });
  };

  const confirm = () => {
    const pickedDoc = checkedDocumentLines(
      (data()?.rows ?? []).map((doc) => ({
        id: doc.shipping_order_id,
        skipped_no_item_count: doc.skipped_no_item_count,
        lines: doc.lines,
      })),
      selected(),
      unchecked(),
      (line) => line.sales_order_line_id,
    );
    if (!pickedDoc) {
      toast.error("Select one shipping order.");
      return;
    }
    const picked = pickedDoc.lines.map((r) => ({ ...r, source_sales_order_line_id: r.sales_order_line_id }));
    if (picked.length === 0) return;
    if (pickedDoc.skipped > 0) {
      toast.warning(`${pickedDoc.skipped} line(s) have no inventory item and were not loaded.`);
    }
    props.onConfirm(picked);
    props.onClose();
    setSelected(new Set<number>());
    setUnchecked(new Set<number>());
  };

  const totalPages = () => Math.max(1, Math.ceil((data()?.total ?? 0) / pageSize()));

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:items-center">
        <div class="w-full max-w-5xl rounded-2xl border border-stroke bg-white shadow-xl">
          <div class="flex items-center justify-between border-b border-stroke px-5 py-3">
            <h2 class="text-lg font-semibold text-text-primary">Load Slip — Shipping Order</h2>
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
                        <th class="py-2 pr-4">Lines</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={payload().rows}>
                        {(row) => (
                          <>
                            <tr class="border-b border-stroke/60 hover:bg-brand-50">
                              <td class="py-2 pr-2">
                                <input
                                  type="checkbox"
                                  checked={selected().has(row.shipping_order_id)}
                                  onChange={() => toggleRow(row.shipping_order_id)}
                                />
                              </td>
                              <td class="py-2 pr-4">{row.shipping_no}</td>
                              <td class="py-2 pr-4">{openSlipDocStatusLabel(row.status)}</td>
                              <td class="py-2 pr-4">{row.lines[0]?.sales_order_no ?? ""}</td>
                              <td class="py-2 pr-4">{openSlipDocStatusLabel(row.lines[0]?.sales_order_status)}</td>
                              <td class="py-2 pr-4">{row.customer_name}</td>
                              <td class="py-2 pr-4">
                                {slipLineSummary(row.open_line_count, row.source_line_count, row.skipped_no_item_count)}
                              </td>
                            </tr>
                            <tr class="border-b border-stroke/60 bg-slate-50">
                              <td colspan={7} class="px-8 py-2">
                                <SlipNestedLines
                                  unchecked={unchecked()}
                                  onToggle={(lineId) => toggleLine(row.shipping_order_id, lineId)}
                                  lines={row.lines.map((line) => ({
                                    id: line.sales_order_line_id,
                                    label: `${line.item_code} — ${line.item_name}`,
                                    qty: String(line.balance_qty),
                                  }))}
                                />
                              </td>
                            </tr>
                          </>
                        )}
                      </For>
                    </tbody>
                  </table>
                  <div class="mt-4 flex justify-between text-sm text-text-secondary">
                    <span>
                      Page {page()} of {totalPages()}
                    </span>
                    <div class="flex gap-2">
                      <PageSizeSelect value={pageSize()} onChange={(n) => { setPageSize(n); setPage(1); }} />
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
