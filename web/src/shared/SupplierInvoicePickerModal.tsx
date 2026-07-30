import { createEffect, createSignal, For, Show } from "solid-js";
import { apiFetch } from "./api";
import { formatPeso } from "./money";
import { modalDismissClass } from "./Modal";

export type SupplierInvoicePickerRow = {
  id: number;
  invoice_no: string;
  partner_id?: number | null;
  partner_name?: string;
  vendor_name?: string;
  grand_total: number;
  invoice_date?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (row: SupplierInvoicePickerRow) => void;
  initialQ?: string;
  partnerId?: number | null;
};

export function SupplierInvoicePickerModal(props: Props) {
  const [q, setQ] = createSignal("");
  const [rows, setRows] = createSignal<SupplierInvoicePickerRow[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");

  const search = async (query?: string) => {
    setLoading(true);
    setError("");
    const qs = new URLSearchParams({
      page: "1",
      pageSize: "40",
      sort: "invoice_date",
      order: "desc",
    });
    const needle = (query ?? q()).trim();
    if (needle) qs.set("q", needle);
    if (props.partnerId) qs.set("partner_id", String(props.partnerId));
    const res = await apiFetch<SupplierInvoicePickerRow[]>(`/api/v1/finance/supplier-invoices?${qs}`);
    setLoading(false);
    if (!res.success) {
      setError(res.message ?? "Failed to load supplier invoices.");
      setRows([]);
      return;
    }
    setRows(res.data ?? []);
  };

  createEffect(() => {
    if (!props.open) return;
    const seed = props.initialQ ?? "";
    setQ(seed);
    void search(seed);
  });

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:items-center">
        <div class="w-full max-w-2xl rounded-2xl border border-stroke bg-white shadow-xl">
          <div class="flex items-center justify-between border-b border-stroke px-5 py-3">
            <h2 class="text-lg font-semibold text-text-primary">Select supplier invoice</h2>
            <button type="button" class={modalDismissClass} onClick={() => props.onClose()}>
              Close
            </button>
          </div>
          <div class="flex flex-wrap gap-2 border-b border-stroke px-5 py-3">
            <input
              type="search"
              class="min-w-[12rem] flex-1 rounded-lg border border-stroke px-3 py-2 text-sm"
              placeholder="Search invoice no., vendor…"
              value={q()}
              onInput={(e) => setQ(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void search();
                }
              }}
            />
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              onClick={() => void search()}
            >
              Search
            </button>
          </div>
          <div class="max-h-[24rem] overflow-auto p-2">
            <Show when={loading()}>
              <p class="px-3 py-4 text-sm text-text-secondary">Loading…</p>
            </Show>
            <Show when={error()}>
              <p class="px-3 py-4 text-sm text-red-600">{error()}</p>
            </Show>
            <Show when={!loading() && !error()}>
              <table class="min-w-full text-sm">
                <thead>
                  <tr class="text-left text-text-secondary">
                    <th class="px-3 py-2">Invoice</th>
                    <th class="px-3 py-2">Vendor</th>
                    <th class="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <For
                    each={rows()}
                    fallback={
                      <tr>
                        <td class="px-3 py-6 text-center text-text-secondary" colSpan={3}>
                          No invoices found.
                        </td>
                      </tr>
                    }
                  >
                    {(row) => (
                      <tr
                        class="cursor-pointer border-t border-stroke/60 hover:bg-slate-50"
                        onClick={() => {
                          props.onSelect(row);
                          props.onClose();
                        }}
                      >
                        <td class="px-3 py-2">{row.invoice_no}</td>
                        <td class="px-3 py-2">{row.partner_name || row.vendor_name || "—"}</td>
                        <td class="px-3 py-2 text-right">{formatPeso(row.grand_total)}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
}
