import { createResource, For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { modalDismissClass } from "../../../shared/Modal";

export type CreatedSlipLine = {
  line_id: number;
  line_no: number;
  item_code: string;
  item_name: string;
  qty: number;
  balance_qty: number;
  slips: Array<{
    id: number;
    slip_type: string;
    slip_ref?: string | null;
    slip_date_no?: string | null;
    qty: number;
  }>;
};

type Props = {
  open: boolean;
  quotationId: number | null;
  onClose: () => void;
};

async function fetchSlips(id: number) {
  const res = await apiFetch<CreatedSlipLine[]>(`/api/v1/quotation/quotations/${id}/created-slips`);
  if (!res.success) throw new Error(res.message ?? "Failed to load slips");
  return res.data ?? [];
}

export function CreatedSlipModal(props: Props) {
  const [data] = createResource(
    () => (props.open && props.quotationId ? props.quotationId : null),
    async (id) => fetchSlips(id!),
  );

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-[55] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
        <div class="w-full max-w-4xl rounded-2xl border border-stroke bg-white p-6 shadow-xl">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-lg font-semibold text-text-primary">Created Slips</h2>
            <button type="button" class={modalDismissClass} onClick={() => props.onClose()}>
              Close
            </button>
          </div>
          <Show when={data.loading}>
            <p class="text-sm text-text-secondary">Loading…</p>
          </Show>
          <Show when={data.error}>
            <p class="text-sm text-red-600">{String(data.error)}</p>
          </Show>
          <Show when={data()}>
            {(lines) => (
              <div class="overflow-x-auto">
                <table class="erp-grid min-w-full text-sm">
                  <thead class="bg-slate-50 text-left text-xs uppercase text-text-secondary">
                    <tr>
                      <th class="px-3 py-2">Line</th>
                      <th class="px-3 py-2">Item</th>
                      <th class="px-3 py-2 text-right">Qty</th>
                      <th class="px-3 py-2 text-right">Balance</th>
                      <th class="px-3 py-2">Slips</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={lines()}>
                      {(ln) => (
                        <tr class="border-t border-stroke/60">
                          <td class="px-3 py-2">{ln.line_no}</td>
                          <td class="px-3 py-2">
                            {ln.item_code} — {ln.item_name}
                          </td>
                          <td class="px-3 py-2 text-right">{ln.qty}</td>
                          <td class="px-3 py-2 text-right">{ln.balance_qty}</td>
                          <td class="px-3 py-2">
                            <Show when={ln.slips.length > 0} fallback={<span class="text-text-secondary">—</span>}>
                              <ul class="space-y-1 text-xs">
                                <For each={ln.slips}>
                                  {(s) => (
                                    <li>
                                      {s.slip_type}
                                      {s.slip_date_no ? ` · ${s.slip_date_no}` : ""}
                                      {s.slip_ref ? ` · ${s.slip_ref}` : ""} — qty {s.qty}
                                    </li>
                                  )}
                                </For>
                              </ul>
                            </Show>
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            )}
          </Show>
        </div>
      </div>
    </Show>
  );
}
