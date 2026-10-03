import { For, Show, createResource } from "solid-js";
import { fetchAvailableSerials, type PosAvailableSerial } from "../../shared/usePos";

/**
 * One-step serial picker for track_serial cart lines (parity with PosLotPickSheet).
 */
export function PosSerialPickSheet(props: {
  itemId: number;
  itemName: string;
  locationId: number | null;
  busy?: boolean;
  onCancel: () => void;
  onPick: (unit: PosAvailableSerial) => void;
}) {
  const [units] = createResource(
    () => ({ itemId: props.itemId, locationId: props.locationId }),
    async (key) => {
      const res = await fetchAvailableSerials(key.itemId, key.locationId);
      if (!res.success) return [] as PosAvailableSerial[];
      return res.data ?? [];
    },
  );

  return (
    <div class="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4" onClick={props.onCancel}>
      <div
        class="w-full max-h-[85dvh] overflow-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-md sm:rounded-2xl"
        style={{ "padding-bottom": "max(1.25rem, env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 class="text-lg font-semibold text-slate-900">Pick a serial</h3>
        <p class="mt-1 text-sm text-slate-500">{props.itemName} · qty 1</p>
        <p class="mt-1 text-xs text-slate-400">Or cancel and scan the serial barcode in the search box.</p>

        <Show when={units.loading}>
          <p class="mt-4 text-sm text-slate-500">Loading serials…</p>
        </Show>

        <Show when={!units.loading}>
          <Show
            when={(units() ?? []).length > 0}
            fallback={
              <p class="mt-4 text-sm text-slate-500">
                No sellable serials at this register. Transfer or register units at this location, then try again.
              </p>
            }
          >
            <ul class="mt-4 space-y-2">
              <For each={units() ?? []}>
                {(unit) => (
                  <li>
                    <button
                      type="button"
                      class="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left hover:border-emerald-400 hover:bg-emerald-50 disabled:opacity-40"
                      disabled={props.busy}
                      onClick={() => props.onPick(unit)}
                    >
                      <span class="min-w-0">
                        <span class="block truncate text-sm font-semibold text-slate-900">{unit.serial_no}</span>
                        <span class="text-xs text-slate-500">{unit.status.replace(/_/g, " ")}</span>
                      </span>
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Show>

        <button
          type="button"
          class="mt-4 w-full rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          disabled={props.busy}
          onClick={props.onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
