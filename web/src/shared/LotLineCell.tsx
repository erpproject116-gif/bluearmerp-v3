import { createEffect, createSignal, For, Show } from "solid-js";
import { apiFetch } from "./api";
import { Modal } from "./Modal";
import { inputClass } from "./SpreadsheetGrid";
import type { LotBatchRow } from "./useSerialLotList";
import { uiLabel } from "../shared/branding/uiLabel";

type Props = {
  itemId: number;
  locationId?: number | null;
  lotBatchId?: number | null;
  lotNo?: string;
  disabled?: boolean;
  onChange: (lotBatchId: number | null, lotNo: string) => void;
};

export function LotLineCell(props: Props) {
  const [open, setOpen] = createSignal(false);
  const [rows, setRows] = createSignal<LotBatchRow[]>([]);
  const [loading, setLoading] = createSignal(false);

  const load = async () => {
    setLoading(true);
    const qs = new URLSearchParams({
      page: "1",
      pageSize: "50",
      item_id: String(props.itemId),
      available_only: "true",
    });
    if (props.locationId) qs.set("location_id", String(props.locationId));
    const res = await apiFetch<LotBatchRow[]>(`/api/v1/inventory/lot-batches?${qs}`);
    setLoading(false);
    if (res.success && res.data) setRows(res.data);
  };

  createEffect(() => {
    if (open()) void load();
  });

  const label = () => props.lotNo || (props.lotBatchId ? `Lot #${props.lotBatchId}` : "—");

  return (
    <>
      <button
        type="button"
        class="w-full truncate text-left text-xs text-brand-700 hover:underline disabled:opacity-50"
        disabled={props.disabled}
        onClick={() => setOpen(true)}
      >
        {label()}
      </button>
      <Modal open={open()} title="Select lot batch" onClose={() => setOpen(false)} wide>
        <Show when={!loading()} fallback={<p class="text-sm text-text-secondary">{uiLabel("common.loading")}</p>}>
          <Show
            when={rows().length > 0}
            fallback={<p class="text-sm text-text-secondary">No available lot batches at this location.</p>}
          >
            <table class="min-w-full text-sm">
              <thead class="bg-slate-50 text-left text-xs uppercase text-text-secondary">
                <tr>
                  <th class="px-2 py-2">Lot no.</th>
                  <th class="px-2 py-2">Location</th>
                  <th class="px-2 py-2 text-right">On hand</th>
                  <th class="px-2 py-2">Expiry</th>
                  <th class="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                <For each={rows()}>
                  {(row) => (
                    <tr class="border-t border-stroke">
                      <td class="px-2 py-2">{row.lot_no}</td>
                      <td class="px-2 py-2">{row.location_name}</td>
                      <td class="px-2 py-2 text-right">{row.qty_on_hand.toFixed(4)}</td>
                      <td class="px-2 py-2">{row.expiry_date?.slice(0, 10) ?? "—"}</td>
                      <td class="px-2 py-2 text-right">
                        <button
                          type="button"
                          class="rounded border border-stroke px-2 py-0.5 text-xs hover:bg-slate-50"
                          onClick={() => {
                            props.onChange(row.id, row.lot_no);
                            setOpen(false);
                          }}
                        >
                          Select
                        </button>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </Show>
        </Show>
        <div class="mt-4 flex justify-end gap-2">
          <button type="button" class={`${inputClass} px-3 py-1.5 text-sm`} onClick={() => setOpen(false)}>
            Cancel
          </button>
          <Show when={props.lotBatchId}>
            <button
              type="button"
              class="rounded border border-stroke px-3 py-1.5 text-sm text-red-600"
              onClick={() => {
                props.onChange(null, "");
                setOpen(false);
              }}
            >
              Clear lot
            </button>
          </Show>
        </div>
      </Modal>
    </>
  );
}
