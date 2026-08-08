import { A } from "@solidjs/router";
import { For, Show, createMemo, createResource } from "solid-js";
import { Modal } from "../../../shared/Modal";
import { LoadingText } from "../../../shared/LoadingText";
import { apiFetch } from "../../../shared/api";
import {
  useLotBatchList,
  type LotBatchRow,
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

type AvailableSerialRow = {
  id: number;
  serial_no: string;
  status: string;
  location_id?: number | null;
  location_name?: string;
  warranty_end?: string | null;
};

type Props = {
  target: FindStockUnitsTarget | null;
  onClose: () => void;
};

function registryHref(t: FindStockUnitsTarget) {
  const qs = new URLSearchParams({
    item_id: String(t.item_id),
    location_id: String(t.location_id),
  });
  const base = t.kind === "lots" ? "/app/inventory/serial-lot/lots" : "/app/inventory/serial-lot/registry";
  return `${base}?${qs}`;
}

export function FindStockUnitsModal(props: Props) {
  const open = () => props.target != null;
  const t = () => props.target;

  const [serials] = createResource(
    () => {
      const cur = t();
      if (!cur || cur.kind !== "serials") return null;
      return { item_id: cur.item_id, location_id: cur.location_id };
    },
    async (p) => {
      if (!p) return [] as AvailableSerialRow[];
      const qs = new URLSearchParams({
        item_id: String(p.item_id),
        location_id: String(p.location_id),
      });
      const res = await apiFetch<AvailableSerialRow[]>(`/api/v1/inventory/serial-units/available?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load serials.");
      return res.data ?? [];
    },
  );

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

  const serialLoading = () => serials.loading;
  const serialError = () => serials.error as Error | undefined;
  const serialRows = (): AvailableSerialRow[] => serials() ?? [];
  const lotLoading = () => lots.isFetching;
  const lotError = () => lots.error as Error | undefined;
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
              <Show when={cur().kind === "serials" && !serialLoading() && !serialError()}>
                <p class="mt-1 text-xs font-medium text-text-primary">
                  {serialRows().length.toLocaleString()} on hand at {cur().branch_name}
                </p>
              </Show>
              <Show when={cur().kind === "lots" && !lotLoading() && !lotError()}>
                <p class="mt-1 text-xs font-medium text-text-primary">
                  {lotRows().length.toLocaleString()} lot batch(es) at {cur().branch_name}
                </p>
              </Show>
            </div>

            <Show when={cur().kind === "serials"}>
              <Show when={serialLoading()}>
                <LoadingText class="text-sm text-text-secondary" />
              </Show>
              <Show when={!serialLoading() && serialError()}>
                <p class="text-sm text-red-600">{serialError()?.message ?? "Failed to load serials."}</p>
              </Show>
              <Show when={!serialLoading() && !serialError()}>
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
                          <th class="px-3 py-2">Warranty end</th>
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
                              <td class="px-3 py-2">{r.warranty_end?.slice(0, 10) ?? "—"}</td>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                  </div>
                </Show>
              </Show>
            </Show>

            <Show when={cur().kind === "lots"}>
              <Show when={lotLoading()}>
                <LoadingText class="text-sm text-text-secondary" />
              </Show>
              <Show when={!lotLoading() && lotError()}>
                <p class="text-sm text-red-600">{lotError()?.message ?? "Failed to load lots."}</p>
              </Show>
              <Show when={!lotLoading() && !lotError()}>
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
            </Show>

            <div class="flex flex-wrap justify-end gap-2 border-t border-stroke pt-3">
              <A
                href={registryHref(cur())}
                class="rounded-lg border border-stroke px-3 py-1.5 text-sm text-brand-700 hover:bg-brand-50"
              >
                Manage in {cur().kind === "lots" ? "Lots" : "Registry"}
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
