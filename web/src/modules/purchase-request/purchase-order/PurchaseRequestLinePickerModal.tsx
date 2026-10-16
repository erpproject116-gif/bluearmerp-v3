import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { inputClass } from "../../../shared/SpreadsheetGrid";
import { modalDismissClass } from "../../../shared/Modal";
import { formatMoney } from "../../../shared/money";
import { LoadingText } from "../../../shared/LoadingText";
import { openSlipDocStatusLabel } from "../../../shared/openSlipDocStatusLabel";
import { SlipLinesToggle, SlipNestedLines } from "../../../shared/SlipNestedLines";
import { checkedDocumentLines, slipLineSummary } from "../../../shared/slipDocument";
import { useToast } from "../../../shared/toast";

export type OpenPurchaseRequestLineRow = {
  purchase_request_id: number;
  purchase_request_line_id: number;
  date_no_display: string;
  reference_no: string;
  progress_status?: string;
  location_id: number;
  location_name: string;
  tax_type_id: number;
  currency_id: number;
  pic_name: string;
  partner_id?: number | null;
  partner_code: string;
  partner_name: string;
  item_id?: number | null;
  item_code: string;
  item_name: string;
  spec_name?: string | null;
  description?: string | null;
  qty: number;
  balance_qty: number;
  unit_id?: number | null;
  unit_code?: string | null;
  input_basis: string;
  unit_price: number;
  unit_non_vat: number;
  unit_vat_inc: number;
  remark?: string | null;
  track_serial?: boolean;
  planned_serial_nos?: string[];
};

export type PickedPurchaseRequestLine = OpenPurchaseRequestLineRow & {
  source_purchase_request_line_id: number;
};

type OpenPurchaseRequestDocument = {
  purchase_request_id: number;
  date_no_display: string;
  reference_no: string;
  progress_status?: string;
  partner_name: string;
  open_line_count: number;
  source_line_count: number;
  skipped_no_item_count: number;
  lines: OpenPurchaseRequestLineRow[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (lines: PickedPurchaseRequestLine[]) => void;
};

async function fetchOpenLines(q: string, page: number, pageSize: number) {
  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort: "request_date", order: "desc" });
  if (q) qs.set("q", q);
  const res = await apiFetch<OpenPurchaseRequestDocument[]>(`/api/v1/purchase-order/purchase-orders/purchase-request-lines/open?${qs}`);
  if (!res.success) throw new Error(res.message ?? "Failed to load purchase request lines");
  return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
}

export function PurchaseRequestLinePickerModal(props: Props) {
  const toast = useToast();
  const [q, setQ] = createSignal("");
  const [page, setPage] = createSignal(1);
  const [selected, setSelected] = createSignal<Set<number>>(new Set());
  const [unchecked, setUnchecked] = createSignal<Set<number>>(new Set());
  const [openLines, setOpenLines] = createSignal<Set<number>>(new Set());
  createEffect(() => {
    if (!props.open) setOpenLines(new Set<number>());
  });
  const [pageSize] = createSignal(20);

  const [data] = createResource(
    () => (props.open ? { q: q(), page: page() } : null),
    async (p) => fetchOpenLines(p!.q, p!.page, pageSize()),
  );

  const toggleRow = (docId: number) => {
    const doc = (data()?.rows ?? []).find((d) => d.purchase_request_id === docId);
    setUnchecked((prev) => {
      const next = new Set(prev);
      for (const line of doc?.lines ?? []) next.delete(line.purchase_request_line_id);
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
    const doc = (data()?.rows ?? []).find((d) => d.purchase_request_id === docId);
    const ids = (doc?.lines ?? []).map((line) => line.purchase_request_line_id);
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

  const toggleAll = () => {
    const rows = data()?.rows ?? [];
    if (selected().size === rows.length) setSelected(new Set<number>());
    else setSelected(new Set(rows.map((r) => r.purchase_request_id)));
    setUnchecked(new Set<number>());
  };

  const confirm = () => {
    const pickedDoc = checkedDocumentLines(
      (data()?.rows ?? []).map((doc) => ({
        id: doc.purchase_request_id,
        skipped_no_item_count: doc.skipped_no_item_count,
        lines: doc.lines,
      })),
      selected(),
      unchecked(),
      (line) => line.purchase_request_line_id,
    );
    if (!pickedDoc) {
      toast.error("Select one purchase request.");
      return;
    }
    const picked = pickedDoc.lines.map((r) => ({ ...r, source_purchase_request_line_id: r.purchase_request_line_id }));
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
            <h2 class="text-lg font-semibold text-text-primary">Load Slip — Purchase Request</h2>
            <button type="button" class={modalDismissClass} onClick={() => props.onClose()}>
              Close
            </button>
          </div>

          <div class="flex flex-wrap items-center gap-2 border-b border-stroke px-5 py-3">
            <input
              class={`${inputClass} max-w-xs`}
              placeholder="Search reference, vendor, item…"
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
                  <Show when={payload().rows.length === 0}>
                    <p class="mb-3 text-sm text-amber-800">
                      No open Purchase Request lines with registered inventory items. Free-text PR lines must be linked to Inventory before Load Slip → Purchase Order.
                    </p>
                  </Show>
                  <table class="erp-grid min-w-full text-sm">
                    <thead>
                      <tr class="border-b border-stroke text-left text-xs uppercase text-text-secondary">
                        <th class="w-10 py-2 pr-2">
                          <input
                            type="checkbox"
                            checked={payload().rows.length > 0 && selected().size === payload().rows.length}
                            onChange={toggleAll}
                          />
                        </th>
                        <th class="py-2 pr-4">Date-No</th>
                        <th class="py-2 pr-4">Reference</th>
                        <th class="py-2 pr-4">Status</th>
                        <th class="py-2 pr-4">Vendor</th>
                        <th class="py-2 pr-4">Lines</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={payload().rows}>
                        {(row) => (
                          <>
                            <tr class="border-b border-stroke/60 hover:bg-brand-50">
                              <td class="py-2 pr-2">
                                <div class="flex items-center gap-1">
                                  <SlipLinesToggle
                                    open={openLines().has(row.purchase_request_id)}
                                    onToggle={() =>
                                      setOpenLines((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(row.purchase_request_id)) next.delete(row.purchase_request_id);
                                        else next.add(row.purchase_request_id);
                                        return next;
                                      })
                                    }
                                  />
                                  <input
                                    type="checkbox"
                                    checked={selected().has(row.purchase_request_id)}
                                    onChange={() => toggleRow(row.purchase_request_id)}
                                  />
                                </div>
                              </td>
                              <td class="py-2 pr-4">{row.date_no_display}</td>
                              <td class="py-2 pr-4">{row.reference_no}</td>
                              <td class="py-2 pr-4">{openSlipDocStatusLabel(row.progress_status)}</td>
                              <td class="py-2 pr-4">{row.partner_name}</td>
                              <td class="py-2 pr-4">
                                {slipLineSummary(row.open_line_count, row.source_line_count, row.skipped_no_item_count)}
                              </td>
                            </tr>
                            <Show when={openLines().has(row.purchase_request_id)}>
                            <tr class="border-b border-stroke/60 bg-slate-50">
                              <td colspan={6} class="px-8 py-2">
                                <SlipNestedLines
                                  unchecked={unchecked()}
                                  onToggle={(lineId) => toggleLine(row.purchase_request_id, lineId)}
                                  lines={row.lines.map((line) => ({
                                    id: line.purchase_request_line_id,
                                    label: `${line.item_code} — ${line.item_name}`,
                                    qty: `${line.balance_qty} @ ${formatMoney(line.unit_price)}`,
                                  }))}
                                />
                              </td>
                            </tr>
                            </Show>
                          </>
                        )}
                      </For>
                    </tbody>
                  </table>
                  <Show when={payload().total > pageSize()}>
                    <div class="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        class="rounded border border-stroke px-2 py-1 text-sm disabled:opacity-40"
                        disabled={page() <= 1}
                        onClick={() => setPage((p) => p - 1)}
                      >
                        Previous
                      </button>
                      <span class="text-sm text-text-secondary">
                        Page {page()} of {totalPages()}
                      </span>
                      <button
                        type="button"
                        class="rounded border border-stroke px-2 py-1 text-sm disabled:opacity-40"
                        disabled={page() >= totalPages()}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Next
                      </button>
                    </div>
                  </Show>
                </>
              )}
            </Show>
          </div>

          <div class="flex justify-end gap-2 border-t border-stroke px-5 py-3">
            <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={() => props.onClose()}>
              Cancel
            </button>
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              disabled={selected().size === 0}
              onClick={confirm}
            >
              Add selected ({selected().size})
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
