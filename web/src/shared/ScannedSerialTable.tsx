import { createMemo, createSignal, For, Show } from "solid-js";
import { inputClass } from "./SpreadsheetGrid";
import type { ResolvedSerialUnit } from "./serialScanTypes";

type Row = ResolvedSerialUnit & { error?: string };

type Props = {
  units: Row[];
  maxQty?: number;
  disabled?: boolean;
  onRemove?: (unitId: number) => void;
  showItemDetails?: boolean;
};

function matchRow(row: Row, q: string): boolean {
  const needle = q.toLowerCase();
  return (
    row.serial_no.toLowerCase().includes(needle) ||
    row.item_code.toLowerCase().includes(needle) ||
    row.item_name.toLowerCase().includes(needle) ||
    (row.manufacturer ?? "").toLowerCase().includes(needle) ||
    (row.item_category_name ?? "").toLowerCase().includes(needle) ||
    (row.location_name ?? "").toLowerCase().includes(needle) ||
    (row.partner_name ?? "").toLowerCase().includes(needle) ||
    row.status.toLowerCase().includes(needle)
  );
}

export function ScannedSerialTable(props: Props) {
  const [filter, setFilter] = createSignal("");
  const showItem = () => props.showItemDetails !== false;

  const filtered = createMemo(() => {
    const q = filter().trim();
    if (!q) return props.units;
    return props.units.filter((r) => matchRow(r, q));
  });

  const counter = () => {
    const total = props.units.length;
    const max = props.maxQty;
    const q = filter().trim();
    const shown = filtered().length;
    let text = max != null ? `${total} / ${max} scanned` : `${total} scanned`;
    if (q) text += ` · ${shown} match`;
    return text;
  };

  return (
    <div class="space-y-2">
      <div class="flex flex-wrap items-center gap-2">
        <input
          class={`${inputClass} min-w-[12rem] flex-1`}
          value={filter()}
          disabled={props.disabled}
          placeholder="Search serial, item, manufacturer…"
          onInput={(e) => setFilter(e.currentTarget.value)}
        />
        <span class="text-xs text-text-secondary">{counter()}</span>
      </div>
      <Show
        when={props.units.length > 0}
        fallback={<p class="py-4 text-center text-sm text-text-secondary">No serials scanned yet.</p>}
      >
        <div class="max-h-52 overflow-y-auto rounded border border-stroke">
          <table class="min-w-full text-sm">
            <thead class="sticky top-0 bg-slate-50">
              <tr>
                <th class="px-2 py-1 text-left">Serial no.</th>
                <Show when={showItem()}>
                  <th class="px-2 py-1 text-left">Item code</th>
                  <th class="px-2 py-1 text-left">Item name</th>
                  <th class="px-2 py-1 text-left">Manufacturer</th>
                </Show>
                <th class="px-2 py-1 text-left">Location</th>
                <th class="px-2 py-1 text-left">Status</th>
                <Show when={props.onRemove}>
                  <th class="w-10 px-2 py-1" />
                </Show>
              </tr>
            </thead>
            <tbody>
              <For each={filtered()}>
                {(row) => (
                  <tr class={row.error ? "bg-red-50" : undefined}>
                    <td class="px-2 py-1 font-medium">{row.serial_no}</td>
                    <Show when={showItem()}>
                      <td class="px-2 py-1">{row.item_code}</td>
                      <td class="px-2 py-1">{row.item_name}</td>
                      <td class="px-2 py-1">{row.manufacturer || "—"}</td>
                    </Show>
                    <td class="px-2 py-1">{row.location_name || "—"}</td>
                    <td class="px-2 py-1 capitalize">{row.error ? row.error : row.status}</td>
                    <Show when={props.onRemove}>
                      <td class="px-2 py-1">
                        <button
                          type="button"
                          class="text-xs text-red-600 hover:underline disabled:opacity-50"
                          disabled={props.disabled}
                          onClick={() => props.onRemove?.(row.serial_unit_id)}
                        >
                          ✕
                        </button>
                      </td>
                    </Show>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
        <Show when={filter().trim() && filtered().length === 0}>
          <p class="text-xs text-text-secondary">No serials match your search.</p>
        </Show>
      </Show>
    </div>
  );
}
