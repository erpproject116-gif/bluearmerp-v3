import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { Modal } from "../../../shared/Modal";
import { inputClass } from "../../../shared/SpreadsheetGrid";

export type RmaCandidate = {
  sales_id: number;
  sales_no: string;
  sales_line_id: number;
  item_id?: number | null;
  item_code: string;
  item_name: string;
  serial_unit_id: number;
  serial_no: string;
  partner_id: number;
  customer_name: string;
  order_date: string;
};

type Props = {
  open: boolean;
  partnerId?: number | null;
  onClose: () => void;
  onPick: (row: RmaCandidate) => void;
};

export function RepairOrderRmaSiPickerModal(props: Props) {
  const [q, setQ] = createSignal("");
  const [submitted, setSubmitted] = createSignal("");

  createEffect(() => {
    if (!props.open) {
      setQ("");
      setSubmitted("");
    }
  });

  const [data] = createResource(
    () => (props.open ? { q: submitted(), partnerId: props.partnerId ?? null } : null),
    async (p) => {
      const qs = new URLSearchParams({ page: "1" });
      if (p!.q) qs.set("q", p!.q);
      if (p!.partnerId) qs.set("partner_id", String(p!.partnerId));
      const res = await apiFetch<RmaCandidate[]>(`/api/v1/inventory/repair-orders/rma-candidates?${qs}`);
      return res.data ?? [];
    },
  );

  return (
    <Modal open={props.open} title="Pick sold serial from Sales Invoice" onClose={props.onClose} wide>
      <p class="mb-3 text-sm text-text-secondary">
        Select the defective unit from the original Sales Invoice. This links RMA to the sale for full traceability.
      </p>
      <div class="mb-3 flex gap-2">
        <input
          class={inputClass + " flex-1"}
          placeholder="Search SI no., serial, item…"
          value={q()}
          onInput={(e) => setQ(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setSubmitted(q().trim());
          }}
        />
        <button
          type="button"
          class="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white"
          onClick={() => setSubmitted(q().trim())}
        >
          Search
        </button>
      </div>
      <Show when={props.partnerId}>
        <p class="mb-2 text-xs text-text-secondary">Filtered to the selected customer (clear customer to search all).</p>
      </Show>
      <Show when={data.loading}>
        <p class="text-sm text-text-secondary">Loading…</p>
      </Show>
      <Show when={!data.loading && (data() ?? []).length === 0}>
        <div class="rounded-lg border border-dashed border-stroke bg-slate-50 px-4 py-6 text-center text-sm text-text-secondary">
          No sold serials found. Confirm the unit was sold on a Sales Invoice and is still status Sold (not already returned or in RMA).
        </div>
      </Show>
      <ul class="max-h-80 divide-y divide-stroke overflow-y-auto rounded-lg border border-stroke bg-white">
        <For each={data() ?? []}>
          {(row) => (
            <li>
              <button
                type="button"
                class="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left text-sm hover:bg-brand-50"
                onClick={() => {
                  props.onPick(row);
                  props.onClose();
                }}
              >
                <span class="font-medium text-text-primary">
                  {row.sales_no} · {row.serial_no}
                </span>
                <span class="text-xs text-text-secondary">
                  {row.item_code} — {row.item_name} · {row.customer_name} · {row.order_date}
                </span>
              </button>
            </li>
          )}
        </For>
      </ul>
    </Modal>
  );
}
