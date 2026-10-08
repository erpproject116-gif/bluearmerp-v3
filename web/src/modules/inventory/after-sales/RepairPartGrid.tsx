import { For, Show, createResource, createSignal } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { ItemSearchModal, type ItemSearchRow } from "../../../shared/ItemSearchModal";
import { LotLineCell } from "../../../shared/LotLineCell";
import { inputClass } from "../../../shared/SpreadsheetGrid";

export type PartLineRow = {
  part_key: string;
  item_id?: number | null;
  item_code: string;
  item_name: string;
  qty: string;
  location_id?: number | null;
  serial_unit_id?: number | null;
  serial_no: string;
  lot_no: string;
  track_serial: boolean;
  track_lot: boolean;
  track_inventory_qty: boolean;
};

export function emptyPartLine(): PartLineRow {
  return {
    part_key: "",
    item_code: "",
    item_name: "",
    qty: "1",
    serial_no: "",
    lot_no: "",
    track_serial: false,
    track_lot: false,
    track_inventory_qty: false,
  };
}

type LocationOption = { id: number; location_name: string; is_rma?: boolean };
type SerialOption = { id: number; serial_no: string };

type Props = {
  lines: () => PartLineRow[];
  onChange: (lines: PartLineRow[]) => void;
};

export function RepairPartGrid(props: Props) {
  const [pickerOpen, setPickerOpen] = createSignal(false);
  const [pickerRow, setPickerRow] = createSignal(0);
  const [locations] = createResource(async () => {
    const res = await apiFetch<LocationOption[]>(`/api/v1/inventory/locations?page=1&pageSize=100&status=active`);
    return (res.data ?? []).filter((loc) => !loc.is_rma);
  });

  const update = (index: number, patch: Partial<PartLineRow>) => {
    props.onChange(props.lines().map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const loadSerials = async (index: number) => {
    const row = props.lines()[index];
    if (!row?.item_id || !row.location_id || !row.track_serial) return;
    const qs = new URLSearchParams({
      item_id: String(row.item_id),
      location_id: String(row.location_id),
      free_only: "true",
    });
    const res = await apiFetch<SerialOption[]>(`/api/v1/inventory/serial-units/available?${qs}`);
    const options = res.data ?? [];
    if (row.serial_unit_id && !options.some((opt) => opt.id === row.serial_unit_id)) {
      options.unshift({ id: row.serial_unit_id, serial_no: row.serial_no || `Serial ${row.serial_unit_id}` });
    }
    setSerials({ index, options });
  };

  const [serials, setSerials] = createSignal<{ index: number; options: SerialOption[] }>({ index: -1, options: [] });

  return (
    <div class="mt-4">
      <div class="mb-2 flex items-center justify-between">
        <h3 class="text-sm font-medium text-text-primary">Parts used</h3>
        <button
          type="button"
          class="rounded-lg border border-stroke px-3 py-1 text-sm"
          onClick={() => props.onChange([...props.lines(), emptyPartLine()])}
        >
          Add part
        </button>
      </div>
      <p class="mb-2 text-xs text-text-secondary">
        Stock leaves the shelf only when this order is saved as Covered or Goodwill. The same part is not issued twice.
      </p>
      <Show when={props.lines().length === 0}>
        <p class="text-sm text-text-secondary">No spare parts on this order.</p>
      </Show>
      <Show when={props.lines().length > 0}>
        <div class="overflow-x-auto rounded-lg border border-stroke">
          <table class="min-w-full text-sm">
            <thead class="bg-slate-50 text-left text-text-secondary">
              <tr>
                <th class="px-2 py-2">Item</th>
                <th class="px-2 py-2">Qty</th>
                <th class="px-2 py-2">Stock location</th>
                <th class="px-2 py-2">Serial / lot</th>
                <th class="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              <For each={props.lines()}>
                {(row, index) => (
                  <tr class="border-t border-stroke">
                    <td class="px-2 py-2">
                      <button type="button" class="text-brand-600 hover:underline" onClick={() => { setPickerRow(index()); setPickerOpen(true); }}>
                        {row.item_code ? `${row.item_code} ${row.item_name}` : "Choose item"}
                      </button>
                    </td>
                    <td class="px-2 py-2">
                      <input class={inputClass + " w-20"} value={row.qty} onInput={(e) => update(index(), { qty: e.currentTarget.value })} />
                    </td>
                    <td class="px-2 py-2">
                      <select
                        class={inputClass}
                        value={row.location_id ?? ""}
                        onChange={(e) => {
                          const id = Number(e.currentTarget.value);
                          update(index(), { location_id: id || null, serial_unit_id: null, serial_no: "" });
                        }}
                      >
                        <option value="">Select</option>
                        <For each={locations() ?? []}>
                          {(loc) => <option value={loc.id}>{loc.location_name}</option>}
                        </For>
                      </select>
                    </td>
                    <td class="px-2 py-2">
                      <Show when={row.track_serial}>
                        <select
                          class={inputClass}
                          value={row.serial_unit_id ?? ""}
                          onFocus={() => void loadSerials(index())}
                          onChange={(e) => {
                            const id = Number(e.currentTarget.value);
                            const hit = serials().options.find((opt) => opt.id === id);
                            update(index(), { serial_unit_id: id || null, serial_no: hit?.serial_no ?? "" });
                          }}
                        >
                          <option value="">{row.serial_no || "Select serial"}</option>
                          <For each={serials().index === index() ? serials().options : []}>
                            {(opt) => <option value={opt.id}>{opt.serial_no}</option>}
                          </For>
                        </select>
                      </Show>
                      <Show when={row.track_lot}>
                        <LotLineCell
                          itemId={row.item_id ?? 0}
                          locationId={row.location_id}
                          lotNo={row.lot_no}
                          emptyLabel="Select lot"
                          onChange={(_id, lotNo) => update(index(), { lot_no: lotNo })}
                        />
                      </Show>
                      <Show when={!row.track_serial && !row.track_lot}>
                        <span class="text-text-secondary">—</span>
                      </Show>
                    </td>
                    <td class="px-2 py-2">
                      <button
                        type="button"
                        class="text-sm text-text-secondary hover:underline"
                        onClick={() => props.onChange(props.lines().filter((_, i) => i !== index()))}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
      <ItemSearchModal
        open={pickerOpen()}
        onClose={() => setPickerOpen(false)}
        onSelect={(item: ItemSearchRow) => {
          update(pickerRow(), {
            item_id: item.id,
            item_code: item.item_code,
            item_name: item.item_name,
            track_serial: Boolean(item.track_serial),
            track_lot: Boolean(item.track_lot),
            track_inventory_qty: Boolean(item.track_inventory_qty),
            serial_unit_id: null,
            serial_no: "",
            lot_no: "",
          });
          setPickerOpen(false);
        }}
      />
    </div>
  );
}
