import { createResource, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { inputClass } from "../../../shared/SpreadsheetGrid";
import { modalDismissClass } from "../../../shared/Modal";
import type { OpenGRLine } from "../../../shared/useSupplierInvoiceList";

type Props = {
  open: boolean;
  partnerId: number | null;
  onClose: () => void;
  onConfirm: (lines: OpenGRLine[]) => void;
};

async function fetchOpenLines(partnerId: number) {
  const res = await apiFetch<OpenGRLine[]>(`/api/v1/finance/supplier-invoices/open-gr-lines?partner_id=${partnerId}`);
  if (!res.success) throw new Error(res.message ?? "Failed to load goods receipt lines");
  return res.data ?? [];
}

export function OpenGRLinePickerModal(props: Props) {
  const [q, setQ] = createSignal("");
  const [selected, setSelected] = createSignal<Set<number>>(new Set());

  const [data] = createResource(
    () => (props.open && props.partnerId ? props.partnerId : null),
    async (pid) => fetchOpenLines(pid!),
  );

  const filtered = () => {
    const needle = q().trim().toLowerCase();
    const rows = data() ?? [];
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        r.purchase_order_no.toLowerCase().includes(needle) ||
        r.item_code.toLowerCase().includes(needle) ||
        r.item_name.toLowerCase().includes(needle),
    );
  };

  const toggleRow = (lineId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  };

  const confirm = () => {
    const picked = filtered().filter((r) => selected().has(r.goods_receipt_line_id));
    if (picked.length === 0) return;
    props.onConfirm(picked);
    props.onClose();
    setSelected(new Set<number>());
  };

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:items-center">
        <div class="w-full max-w-5xl rounded-2xl border border-stroke bg-white shadow-xl">
          <div class="flex items-center justify-between border-b border-stroke px-5 py-3">
            <h2 class="text-lg font-semibold text-text-primary">Load Slip (from Goods Receipt) — open lines</h2>
            <button type="button" class={modalDismissClass} onClick={() => props.onClose()}>
              Close
            </button>
          </div>

          <div class="border-b border-stroke px-5 py-3">
            <input
              class={inputClass}
              placeholder="Search PO, item code, or name…"
              value={q()}
              onInput={(e) => setQ(e.currentTarget.value)}
            />
          </div>

          <Show when={!props.partnerId}>
            <p class="p-5 text-sm text-amber-700">Select a vendor on the invoice first.</p>
          </Show>

          <div class="max-h-[50vh] overflow-auto px-5 py-3">
            <Show when={data.loading}>
              <p class="text-sm text-text-secondary">Loading open lines…</p>
            </Show>
            <table class="min-w-full text-sm">
              <thead class="sticky top-0 bg-white text-left text-xs uppercase text-text-secondary">
                <tr>
                  <th class="py-2 pr-2" />
                  <th class="py-2 pr-2">PO</th>
                  <th class="py-2 pr-2">Item</th>
                  <th class="py-2 pr-2 text-right">Balance</th>
                  <th class="py-2 text-right">Unit (VAT inc.)</th>
                </tr>
              </thead>
              <tbody>
                <For each={filtered()}>
                  {(row) => (
                    <tr class="border-t border-stroke/60">
                      <td class="py-2 pr-2">
                        <input
                          type="checkbox"
                          checked={selected().has(row.goods_receipt_line_id)}
                          onChange={() => toggleRow(row.goods_receipt_line_id)}
                        />
                      </td>
                      <td class="py-2 pr-2">{row.purchase_order_no}</td>
                      <td class="py-2 pr-2">
                        {row.item_code} — {row.item_name}
                      </td>
                      <td class="py-2 pr-2 text-right">{row.balance_qty}</td>
                      <td class="py-2 text-right">{row.unit_vat_inc}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
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
              Add {selected().size || ""} line{selected().size === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
