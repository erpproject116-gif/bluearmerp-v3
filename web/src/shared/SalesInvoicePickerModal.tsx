import { createEffect, createSignal, For, Show } from "solid-js";
import { apiFetch } from "./api";
import { formatPeso } from "./money";
import { modalDismissClass } from "./Modal";
import type { SalesRow } from "./useSalesList";

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (row: SalesRow) => void;
  /** Optional customer name / sales no filter seed */
  initialQ?: string;
};

export function SalesInvoicePickerModal(props: Props) {
  const [q, setQ] = createSignal("");
  const [rows, setRows] = createSignal<SalesRow[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");

  const search = async (query?: string) => {
    setLoading(true);
    setError("");
    const qs = new URLSearchParams({
      page: "1",
      pageSize: "40",
      sort: "order_date",
      order: "desc",
    });
    const needle = (query ?? q()).trim();
    if (needle) qs.set("q", needle);
    const res = await apiFetch<SalesRow[]>(`/api/v1/sales?${qs}`);
    setLoading(false);
    if (!res.success) {
      setError(res.message ?? "Failed to load sales invoices.");
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
            <h2 class="text-lg font-semibold text-text-primary">Select sales invoice</h2>
            <button type="button" class={modalDismissClass} onClick={() => props.onClose()}>
              Close
            </button>
          </div>
          <div class="flex flex-wrap gap-2 border-b border-stroke px-5 py-3">
            <input
              type="search"
              class="min-w-[12rem] flex-1 rounded-lg border border-stroke px-3 py-2 text-sm"
              placeholder="Search sales no., customer…"
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
          <Show when={error()}>
            <p class="px-5 pt-3 text-sm text-red-600">{error()}</p>
          </Show>
          <Show when={loading()}>
            <p class="p-5 text-sm text-text-secondary">Loading…</p>
          </Show>
          <div class="max-h-[50vh] overflow-auto">
            <table class="min-w-full text-sm">
              <thead class="sticky top-0 bg-slate-50 text-left text-xs uppercase text-text-secondary">
                <tr>
                  <th class="px-3 py-2">Select</th>
                  <th class="px-3 py-2">Sales no.</th>
                  <th class="px-3 py-2">Date</th>
                  <th class="px-3 py-2">Customer</th>
                  <th class="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                <For
                  each={rows()}
                  fallback={
                    <tr>
                      <td class="px-3 py-6 text-center text-text-secondary" colSpan={5}>
                        {loading() ? "" : "No invoices found."}
                      </td>
                    </tr>
                  }
                >
                  {(row) => (
                    <tr class="border-t border-stroke/60 hover:bg-slate-50">
                      <td class="px-3 py-2">
                        <button
                          type="button"
                          class="text-brand-600 hover:underline"
                          onClick={() => {
                            props.onSelect(row);
                            props.onClose();
                          }}
                        >
                          Select
                        </button>
                      </td>
                      <td class="px-3 py-2 font-medium">{row.sales_no}</td>
                      <td class="px-3 py-2">{row.order_date}</td>
                      <td class="px-3 py-2">{row.customer_name}</td>
                      <td class="px-3 py-2 text-right">{formatPeso(row.grand_total)}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Show>
  );
}
