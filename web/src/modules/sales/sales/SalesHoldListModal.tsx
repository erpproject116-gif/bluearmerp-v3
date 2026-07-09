import { createEffect, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { Modal } from "../../shared/Modal";
import { inputClass } from "../../shared/SpreadsheetGrid";
import { formatPeso } from "../../shared/money";
import { useToast } from "../../shared/toast";
import type { SalesLineRow } from "./SalesLineGrid";

export type SalesHoldPayload = {
  order_date: string;
  tax_type_id: number | null;
  currency_id: number | null;
  partner_id: number | null;
  location_id: number | null;
  location_label?: string;
  customer_label: string;
  pic_user_id: number | null;
  pic_name: string;
  project_id: number | null;
  project_label?: string;
  project_name: string;
  due_date: string;
  terms_of_payment: string;
  payment_terms: string;
  si_dr_no: string;
  notes: string;
  progress_status: string;
  template_code: string;
  sales_category: string;
  source_sales_order_id: number | null;
  lines: SalesLineRow[];
};

export type SalesHoldRow = {
  id: number;
  hold_slot: number;
  partner_id?: number | null;
  location_id?: number | null;
  customer_name?: string | null;
  amount: number;
  hold_type: string;
  payload: SalesHoldPayload;
};

type Props = {
  open: boolean;
  onClose: () => void;
  currentPayload: () => SalesHoldPayload;
  currentAmount: () => number;
  onLoad: (payload: SalesHoldPayload) => void;
};

export function SalesHoldListModal(props: Props) {
  const toast = useToast();
  const [holds, setHolds] = createSignal<SalesHoldRow[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [savingSlot, setSavingSlot] = createSignal<number | null>(null);

  const refresh = async () => {
    setLoading(true);
    const res = await apiFetch<SalesHoldRow[]>("/api/v1/sales/holds");
    setLoading(false);
    if (res.success && res.data) setHolds(res.data);
  };

  createEffect(() => {
    if (props.open) void refresh();
  });

  const slotRow = (slot: number) => holds().find((h) => h.hold_slot === slot) ?? null;

  const saveToSlot = async (slot: number) => {
    setSavingSlot(slot);
    const payload = props.currentPayload();
    const res = await apiFetch<SalesHoldRow>(`/api/v1/sales/holds/${slot}`, {
      method: "PUT",
      body: JSON.stringify({
        hold_slot: slot,
        partner_id: payload.partner_id,
        location_id: payload.location_id,
        customer_name: payload.customer_label || null,
        amount: props.currentAmount(),
        hold_type: "sale",
        payload,
      }),
    });
    setSavingSlot(null);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to save hold.");
      return;
    }
    toast.success(`Hold slot ${slot} saved.`);
    await refresh();
  };

  const loadSlot = (row: SalesHoldRow) => {
    props.onLoad(row.payload);
    toast.success(`Loaded hold slot ${row.hold_slot}.`);
    props.onClose();
  };

  const clearSlot = async (slot: number) => {
    const res = await apiFetch(`/api/v1/sales/holds/${slot}`, { method: "DELETE" });
    if (!res.success) {
      toast.warning(res.message ?? "Failed to clear hold.");
      return;
    }
    toast.success(`Hold slot ${slot} cleared.`);
    await refresh();
  };

  return (
    <Modal open={props.open} title="Hold list (sales invoice)" onClose={props.onClose}>
      <p class="mb-4 text-sm text-text-secondary">
        Park up to 5 draft sales invoices (Ecount-style). Save the current form to a slot, or load a held slip back into the grid.
      </p>
      <Show when={!loading()} fallback={<p class="text-sm text-text-secondary">Loading…</p>}>
        <table class="min-w-full text-sm">
          <thead class="bg-slate-50 text-left text-xs uppercase text-text-secondary">
            <tr>
              <th class="px-2 py-2">Slot</th>
              <th class="px-2 py-2">Customer</th>
              <th class="px-2 py-2 text-right">Amount</th>
              <th class="px-2 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <For each={[1, 2, 3, 4, 5]}>
              {(slot) => {
                const row = () => slotRow(slot);
                return (
                  <tr class="border-t border-stroke">
                    <td class="px-2 py-2 font-medium">{slot}</td>
                    <td class="px-2 py-2">{row()?.customer_name || row()?.payload?.customer_label || "—"}</td>
                    <td class="px-2 py-2 text-right">{row() ? formatPeso(row()!.amount) : "—"}</td>
                    <td class="px-2 py-2 text-right">
                      <div class="flex justify-end gap-1">
                        <button
                          type="button"
                          class="rounded border border-stroke px-2 py-0.5 text-xs hover:bg-slate-50 disabled:opacity-50"
                          disabled={savingSlot() !== null}
                          onClick={() => void saveToSlot(slot)}
                        >
                          {savingSlot() === slot ? "Saving…" : "Save here"}
                        </button>
                        <Show when={row()}>
                          <button
                            type="button"
                            class="rounded border border-brand-200 px-2 py-0.5 text-xs text-brand-700 hover:bg-brand-50"
                            onClick={() => loadSlot(row()!)}
                          >
                            Load
                          </button>
                          <button
                            type="button"
                            class="rounded border border-stroke px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
                            onClick={() => void clearSlot(slot)}
                          >
                            Clear
                          </button>
                        </Show>
                      </div>
                    </td>
                  </tr>
                );
              }}
            </For>
          </tbody>
        </table>
      </Show>
      <div class="mt-4 flex justify-end">
        <button type="button" class={`${inputClass} px-4 py-2 text-sm`} onClick={props.onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
