import { A } from "@solidjs/router";
import { For, Show, createMemo } from "solid-js";
import { Modal } from "../../../shared/Modal";
import { LoadingText } from "../../../shared/LoadingText";
import {
  useLotBatchList,
  useSerialUnitList,
  type LotBatchRow,
  type SerialUnitRow,
} from "../../../shared/useSerialLotList";
import { serialStatusLabel } from "../serial-lot/serialRegistryFilters";

export type FindStockUnitsTarget = {
  kind: "serials" | "lots";
  item_id: number;
  item_code: string;
  item_name: string;
  location_id: number;
  branch_name: string;
};

type Props = {
  target: FindStockUnitsTarget | null;
  onClose: () => void;
};

function registryHref(t: FindStockUnitsTarget) {
  const qs = new URLSearchParams({
    q: t.item_code,
    item_id: String(t.item_id),
    location_id: String(t.location_id),
  });
  const base = t.kind === "lots" ? "/app/inventory/serial-lot/lots" : "/app/inventory/serial-lot/registry";
  return `${base}?${qs}`;
}

export function FindStockUnitsModal(props: Props) {
  const open = () => props.target != null;
  const t = () => props.target;

  const serials = useSerialUnitList(() => {
    const cur = t();
    return {
      page: 1,
      pageSize: 100,
      sort: "serial_no",
      order: "asc" as const,
      item_id: cur?.item_id,
      location_id: cur?.location_id,
      enabled: cur?.kind === "serials",
    };
  });

  const lots = useLotBatchList(() => {
    const cur = t();
    return {
      page: 1,
      pageSize: 100,
      sort: "lot_no",
      order: "asc" as const,
      item_id: cur?.item_id,
      location_id: cur?.location_id,
      enabled: cur?.kind === "lots",
    };
  });

  const title = createMemo(() => {
    const cur = t();
    if (!cur) return "Units";
    return cur.kind === "lots" ? "Lots on hand" : "Serials on hand";
  });

  const loading = () => (t()?.kind === "lots" ? lots.isFetching : serials.isFetching);
  const serialRows = (): SerialUnitRow[] => serials.data?.rows ?? [];
  const lotRows = (): LotBatchRow[] => lots.data?.rows ?? [];

  return (
    <Modal open={open()} title={title()} onClose={() => props.onClose()} wide>
      <Show when={t()}>
        {(cur) => (
          <div class="space-y-4">
            <div class="rounded-lg border border-stroke bg-slate-50 px-3 py-2 text-sm">
              <p class="font-medium text-text-primary">
                {cur().item_code} — {cur().item_name}
              </p>
              <p class="text-xs text-text-secondary">Branch / location: {cur().branch_name}</p>
            </div>

            <Show when={loading()}>
              <LoadingText class="text-sm text-text-secondary" />
            </Show>

            <Show when={!loading() && cur().kind === "serials"}>
              <Show
                when={serialRows().length > 0}
                fallback={<p class="text-sm text-text-secondary">No serial units at this location.</p>}
              >
                <div class="max-h-80 overflow-auto rounded-lg border border-stroke">
                  <table class="erp-grid min-w-full text-left text-sm">
                    <thead class="sticky top-0 bg-brand-50 text-xs font-semibold uppercase text-brand-700">
                      <tr>
                        <th class="px-3 py-2">Serial no.</th>
                        <th class="px-3 py-2">Status</th>
                        <th class="px-3 py-2">Received</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={serialRows()}>
                        {(r) => (
                          <tr class="border-t border-stroke/60">
                            <td class="px-3 py-2 font-mono text-xs">
                              <A
                                href={`/app/inventory/serial-lot/trace?serial_no=${encodeURIComponent(r.serial_no)}`}
                                class="text-brand-600 hover:underline"
                              >
                                {r.serial_no}
                              </A>
                            </td>
                            <td class="px-3 py-2">{serialStatusLabel(r.status)}</td>
                            <td class="px-3 py-2">{r.received_at?.slice(0, 10) ?? "—"}</td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </Show>
            </Show>

            <Show when={!loading() && cur().kind === "lots"}>
              <Show
                when={lotRows().length > 0}
                fallback={<p class="text-sm text-text-secondary">No lot batches at this location.</p>}
              >
                <div class="max-h-80 overflow-auto rounded-lg border border-stroke">
                  <table class="erp-grid min-w-full text-left text-sm">
                    <thead class="sticky top-0 bg-brand-50 text-xs font-semibold uppercase text-brand-700">
                      <tr>
                        <th class="px-3 py-2">Lot no.</th>
                        <th class="px-3 py-2 text-right">Qty on hand</th>
                        <th class="px-3 py-2">Expiry</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={lotRows()}>
                        {(r) => (
                          <tr class="border-t border-stroke/60">
                            <td class="px-3 py-2 font-mono text-xs">{r.lot_no}</td>
                            <td class="px-3 py-2 text-right tabular-nums">
                              {r.qty_on_hand.toLocaleString("en-PH", { maximumFractionDigits: 4 })}
                            </td>
                            <td class="px-3 py-2">{r.expiry_date?.slice(0, 10) ?? "—"}</td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </Show>
            </Show>

            <div class="flex flex-wrap justify-end gap-2 border-t border-stroke pt-3">
              <A
                href={registryHref(cur())}
                class="rounded-lg border border-stroke px-3 py-1.5 text-sm text-brand-700 hover:bg-brand-50"
              >
                Open full {cur().kind === "lots" ? "Lots" : "Registry"}
              </A>
              <button
                type="button"
                class="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
                onClick={() => props.onClose()}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Show>
    </Modal>
  );
}
