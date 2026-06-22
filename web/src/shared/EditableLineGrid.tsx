import { For, Show, createSignal } from "solid-js";
import { inputClass } from "./SpreadsheetGrid";
import { ItemSearchModal, type ItemSearchRow } from "./ItemSearchModal";

export type RepairLineRow = {
  line_no: number;
  item_id?: number | null;
  item_code: string;
  item_name: string;
  problem_issue: string;
  service_charge: string;
  tax_type: string;
  qty: string;
  mop: string;
  serial_lot_no: string;
  remark: string;
};

export function emptyLine(no: number): RepairLineRow {
  return {
    line_no: no,
    item_code: "",
    item_name: "",
    problem_issue: "",
    service_charge: "",
    tax_type: "",
    qty: "",
    mop: "",
    serial_lot_no: "",
    remark: "",
  };
}

type Props = {
  lines: () => RepairLineRow[];
  onChange: (lines: RepairLineRow[]) => void;
};

export function EditableLineGrid(props: Props) {
  const [pickerOpen, setPickerOpen] = createSignal(false);
  const [pickerRow, setPickerRow] = createSignal<number | null>(null);

  const updateRow = (index: number, patch: Partial<RepairLineRow>) => {
    props.onChange(props.lines().map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const addRow = () => {
    const next = props.lines().length + 1;
    props.onChange([...props.lines(), emptyLine(next)]);
  };

  const removeRow = (index: number) => {
    const next = props.lines().filter((_, i) => i !== index).map((r, i) => ({ ...r, line_no: i + 1 }));
    props.onChange(next.length ? next : [emptyLine(1)]);
  };

  const openPicker = (index: number) => {
    setPickerRow(index);
    setPickerOpen(true);
  };

  const onPickItem = (item: ItemSearchRow) => {
    const idx = pickerRow();
    if (idx == null) return;
    const spec = item.spec_name ? ` [${item.spec_name}]` : "";
    updateRow(idx, {
      item_id: item.id,
      item_code: item.item_code,
      item_name: item.item_name + spec,
    });
    setPickerOpen(false);
  };

  return (
    <div class="col-span-full mt-4">
      <div class="mb-2 flex items-center justify-between">
        <h3 class="text-sm font-semibold text-text-primary">Line items</h3>
        <button type="button" class="rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50" onClick={addRow}>
          + Add row
        </button>
      </div>
      <div class="overflow-x-auto rounded-xl border border-stroke">
        <table class="min-w-full text-left text-sm">
          <thead class="border-b border-stroke bg-slate-50 text-xs uppercase text-text-secondary">
            <tr>
              <th class="px-2 py-2">#</th>
              <th class="px-2 py-2">Item Code</th>
              <th class="px-2 py-2">Item Name</th>
              <th class="px-2 py-2">Problem/Issue</th>
              <th class="px-2 py-2">Service Charge</th>
              <th class="px-2 py-2">TAX Type</th>
              <th class="px-2 py-2">Qty</th>
              <th class="px-2 py-2">MOP</th>
              <th class="px-2 py-2">Serial/Lot No.</th>
              <th class="px-2 py-2">Remark</th>
              <th class="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            <For each={props.lines()}>
              {(row, index) => (
                <tr class="border-b border-stroke/60">
                  <td class="px-2 py-1 text-text-secondary">{row.line_no}</td>
                  <td class="px-2 py-1">
                    <input
                      class={`${inputClass} min-w-[5rem] cursor-pointer`}
                      value={row.item_code}
                      title="Double-click to search items"
                      onDblClick={() => openPicker(index())}
                      onInput={(e) => updateRow(index(), { item_code: e.currentTarget.value, item_id: null })}
                    />
                  </td>
                  <td class="px-2 py-1">
                    <input
                      class={`${inputClass} min-w-[12rem]`}
                      value={row.item_name}
                      onInput={(e) => updateRow(index(), { item_name: e.currentTarget.value })}
                    />
                  </td>
                  <td class="px-2 py-1">
                    <input class={inputClass} value={row.problem_issue} onInput={(e) => updateRow(index(), { problem_issue: e.currentTarget.value })} />
                  </td>
                  <td class="px-2 py-1">
                    <input type="number" step="0.01" class={`${inputClass} w-24`} value={row.service_charge} onInput={(e) => updateRow(index(), { service_charge: e.currentTarget.value })} />
                  </td>
                  <td class="px-2 py-1">
                    <input class={`${inputClass} w-20`} value={row.tax_type} onInput={(e) => updateRow(index(), { tax_type: e.currentTarget.value })} />
                  </td>
                  <td class="px-2 py-1">
                    <input type="number" step="0.01" class={`${inputClass} w-16`} value={row.qty} onInput={(e) => updateRow(index(), { qty: e.currentTarget.value })} />
                  </td>
                  <td class="px-2 py-1">
                    <input class={`${inputClass} w-20`} value={row.mop} onInput={(e) => updateRow(index(), { mop: e.currentTarget.value })} />
                  </td>
                  <td class="px-2 py-1">
                    <input class={inputClass} value={row.serial_lot_no} onInput={(e) => updateRow(index(), { serial_lot_no: e.currentTarget.value })} />
                  </td>
                  <td class="px-2 py-1">
                    <input class={inputClass} value={row.remark} onInput={(e) => updateRow(index(), { remark: e.currentTarget.value })} />
                  </td>
                  <td class="px-2 py-1">
                    <Show when={props.lines().length > 1}>
                      <button type="button" class="text-xs text-red-600 hover:underline" onClick={() => removeRow(index())}>
                        Remove
                      </button>
                    </Show>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
      <ItemSearchModal open={pickerOpen()} onClose={() => setPickerOpen(false)} onSelect={onPickItem} />
    </div>
  );
}
