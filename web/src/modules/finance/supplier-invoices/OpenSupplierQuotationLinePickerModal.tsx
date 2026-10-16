import { createResource, createSignal, For, Show, createEffect } from "solid-js";
import { peekResource } from "../../../shared/peekResource";
import { apiFetch } from "../../../shared/api";
import { inputClass } from "../../../shared/SpreadsheetGrid";
import { modalDismissClass } from "../../../shared/Modal";
import { openSlipDocStatusLabel } from "../../../shared/openSlipDocStatusLabel";
import { SlipNestedLines } from "../../../shared/SlipNestedLines";
import { checkedDocumentLines, slipLineSummary } from "../../../shared/slipDocument";
import { useToast } from "../../../shared/toast";
import type { OpenSupplierQuotationInvoiceLine } from "../../../shared/useSupplierInvoiceList";

type Props = {
  open: boolean;
  partnerId: number | null;
  onClose: () => void;
  onConfirm: (lines: OpenSupplierQuotationInvoiceLine[]) => void;
};

type OpenSupplierQuotationInvoiceDocument = {
  supplier_quotation_id: number;
  quote_no: string;
  quote_status: string;
  open_line_count: number;
  source_line_count: number;
  skipped_no_item_count: number;
  lines: OpenSupplierQuotationInvoiceLine[];
};

async function fetchOpenLines(partnerId: number | null, page: number) {
  const qs = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (partnerId) qs.set("partner_id", String(partnerId));
  const res = await apiFetch<OpenSupplierQuotationInvoiceDocument[]>(
    `/api/v1/finance/supplier-invoices/open-supplier-quotation-lines?${qs}`,
  );
  if (!res.success) throw new Error(res.message ?? "Failed to load supplier quotation lines");
  return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
}

export function OpenSupplierQuotationLinePickerModal(props: Props) {
  const toast = useToast();
  const [q, setQ] = createSignal("");
  const [page, setPage] = createSignal(1);
  const [selected, setSelected] = createSignal<Set<number>>(new Set());
  const [unchecked, setUnchecked] = createSignal<Set<number>>(new Set());

  createEffect(() => {
    if (!props.open) {
      setQ("");
      setPage(1);
      setSelected(new Set<number>());
      setUnchecked(new Set<number>());
    }
  });

  const [data] = createResource(
    () => (props.open ? { partnerId: props.partnerId ?? 0, page: page() } : null),
    async (p) => fetchOpenLines(p!.partnerId === 0 ? null : p!.partnerId, p!.page),
  );

  const filtered = () => {
    const needle = q().trim().toLowerCase();
    const rows = peekResource(data)?.rows ?? [];
    if (!needle) return rows;
    return rows.filter(
      (doc) =>
        doc.quote_no.toLowerCase().includes(needle) ||
        doc.lines.some(
          (line) =>
            line.purchase_order_no.toLowerCase().includes(needle) ||
            line.item_code.toLowerCase().includes(needle) ||
            line.item_name.toLowerCase().includes(needle),
        ),
    );
  };

  const toggleRow = (docId: number) => {
    const doc = filtered().find((d) => d.supplier_quotation_id === docId);
    setUnchecked((prev) => {
      const next = new Set(prev);
      for (const line of doc?.lines ?? []) next.delete(line.purchase_order_line_id);
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
    const doc = filtered().find((d) => d.supplier_quotation_id === docId);
    const ids = (doc?.lines ?? []).map((line) => line.purchase_order_line_id);
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
      filtered().map((doc) => ({
        id: doc.supplier_quotation_id,
        skipped_no_item_count: doc.skipped_no_item_count,
        lines: doc.lines,
      })),
      selected(),
      unchecked(),
      (line) => line.purchase_order_line_id,
    );
    if (!pickedDoc) {
      toast.error("Select one supplier quotation.");
      return;
    }
    if (pickedDoc.skipped > 0) {
      toast.warning(`${pickedDoc.skipped} line(s) have no inventory item and were not loaded.`);
    }
    props.onConfirm(pickedDoc.lines);
    props.onClose();
    setSelected(new Set<number>());
    setUnchecked(new Set<number>());
  };

  const totalPages = () => Math.max(1, Math.ceil((peekResource(data)?.total ?? 0) / 20));

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:items-center">
        <div class="w-full max-w-5xl rounded-2xl border border-stroke bg-white shadow-xl">
          <div class="flex items-center justify-between border-b border-stroke px-5 py-3">
            <h2 class="text-lg font-semibold text-text-primary">Load Slip — Supplier Quotation</h2>
            <button type="button" class={modalDismissClass} onClick={() => props.onClose()}>
              Close
            </button>
          </div>

          <div class="border-b border-stroke px-5 py-3">
            <input
              class={inputClass}
              placeholder="Search quote, PO, item code, or name…"
              value={q()}
              onInput={(e) => setQ(e.currentTarget.value)}
            />
          </div>

          <Show when={!props.partnerId}>
            <p class="px-5 pt-3 text-xs text-text-secondary">
              No vendor selected — showing supplier quotations for all vendors. Pick a vendor on the purchase to narrow the list.
            </p>
          </Show>

          <div class="max-h-[50vh] overflow-auto px-5 py-3">
            <Show when={data.loading}>
              <p class="text-sm text-text-secondary">Loading supplier quotations…</p>
            </Show>
            <Show when={data.error}>
              <p class="text-sm text-red-600">Failed to load supplier quotations.</p>
            </Show>
            <Show when={!data.loading && !data.error && filtered().length === 0}>
              <p class="text-sm text-text-secondary">No open supplier quotations for this vendor.</p>
            </Show>
            <table class="min-w-full text-sm">
              <thead class="sticky top-0 bg-white text-left text-xs uppercase text-text-secondary">
                <tr>
                  <th class="py-2 pr-2" />
                  <th class="py-2 pr-2">Quote</th>
                  <th class="py-2 pr-2">Status</th>
                  <th class="py-2 pr-2">Lines</th>
                </tr>
              </thead>
              <tbody>
                <For each={filtered()}>
                  {(row) => (
                    <>
                      <tr class="border-t border-stroke/60">
                        <td class="py-2 pr-2">
                          <input
                            type="checkbox"
                            checked={selected().has(row.supplier_quotation_id)}
                            onChange={() => toggleRow(row.supplier_quotation_id)}
                          />
                        </td>
                        <td class="py-2 pr-2">{row.quote_no}</td>
                        <td class="py-2 pr-2">{openSlipDocStatusLabel(row.quote_status)}</td>
                        <td class="py-2 pr-2">
                          {slipLineSummary(row.open_line_count, row.source_line_count, row.skipped_no_item_count)}
                        </td>
                      </tr>
                      <tr class="border-t border-stroke/40 bg-slate-50">
                        <td colspan={4} class="px-8 py-2">
                          <SlipNestedLines
                            unchecked={unchecked()}
                            onToggle={(lineId) => toggleLine(row.supplier_quotation_id, lineId)}
                            lines={row.lines.map((line) => ({
                              id: line.purchase_order_line_id,
                              label: `${line.purchase_order_no} · ${line.item_code} — ${line.item_name}`,
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
            <div class="mt-3 flex items-center gap-2 text-sm text-text-secondary">
              <button type="button" class="rounded border border-stroke px-2 py-1" disabled={page() <= 1} onClick={() => setPage((p) => p - 1)}>
                Prev
              </button>
              <span>
                Page {page()} of {totalPages()}
              </span>
              <button
                type="button"
                class="rounded border border-stroke px-2 py-1"
                disabled={page() >= totalPages()}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
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
              Apply ({selected().size || 0})
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
