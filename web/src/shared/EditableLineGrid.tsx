import { For, Show, createSignal } from "solid-js";
import { inputClass } from "./SpreadsheetGrid";
import { ItemSearchModal, type ItemSearchRow } from "./ItemSearchModal";
import { DataTableScroll, ResizableTd, ResizableTh } from "./ResizableTable";
import { useResizableColumns } from "./useResizableColumns";

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
  onSerialLotBlur?: (index: number, serialNo: string) => void | Promise<void>;
};

const REPAIR_LINE_COLUMNS = [
  { key: "line_no", header: "#", width: 48 },
  { key: "item_code", header: "Item Code", width: 120 },
  { key: "item_name", header: "Item Name", width: 180 },
  { key: "problem_issue", header: "Problem/Issue", width: 160 },
  { key: "service_charge", header: "Service Charge", width: 120 },
  { key: "tax_type", header: "TAX Type", width: 100 },
  { key: "qty", header: "Qty", width: 72 },
  { key: "mop", header: "MOP", width: 100 },
  { key: "serial_lot_no", header: "Serial/Lot No.", width: 130 },
  { key: "remark", header: "Remark", width: 140 },
  { key: "actions", header: "", width: 72, resizable: false },
] as const;

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

  const { widthFor, onResizeStart, tableWidth } = useResizableColumns(() =>
    REPAIR_LINE_COLUMNS.map((c) => ({ key: c.key, width: c.width })),
  );

  return (
    <div class="col-span-full mt-4">
      <div class="mb-2 flex items-center justify-between">
        <h3 class="text-sm font-semibold text-text-primary">Line items</h3>
        <button type="button" class="rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50" onClick={addRow}>
          + Add row
        </button>
      </div>
      <DataTableScroll class="rounded-xl border border-stroke">
        <table class="erp-grid text-left text-sm" style={{ width: `${tableWidth()}px`, "min-width": "100%" }}>
          <thead class="bg-slate-50 text-xs uppercase text-text-secondary">
            <tr>
              {REPAIR_LINE_COLUMNS.map((c) => (
                <ResizableTh
                  columnKey={c.key}
                  width={widthFor(c.key)}
                  onResizeStart={onResizeStart}
                  resizable={c.key !== "actions"}
                  class="px-2 py-2"
                >
                  {c.header}
                </ResizableTh>
              ))}
            </tr>
          </thead>
          <tbody>
            <For each={props.lines()}>
              {(row, index) => (
                <tr>
                  <ResizableTd width={widthFor("line_no")} class="px-2 py-1 text-text-secondary">
                    {row.line_no}
                  </ResizableTd>
                  <ResizableTd width={widthFor("item_code")} class="px-2 py-1">
                    <input
                      class={`${inputClass} w-full cursor-pointer`}
                      value={row.item_code}
                      title="Double-click to search items"
                      onDblClick={() => openPicker(index())}
                      onInput={(e) => updateRow(index(), { item_code: e.currentTarget.value, item_id: null })}
                    />
                  </ResizableTd>
                  <ResizableTd width={widthFor("item_name")} class="px-2 py-1">
                    <input
                      class={`${inputClass} w-full`}
                      value={row.item_name}
                      onInput={(e) => updateRow(index(), { item_name: e.currentTarget.value })}
                    />
                  </ResizableTd>
                  <ResizableTd width={widthFor("problem_issue")} class="px-2 py-1">
                    <input class={`${inputClass} w-full`} value={row.problem_issue} onInput={(e) => updateRow(index(), { problem_issue: e.currentTarget.value })} />
                  </ResizableTd>
                  <ResizableTd width={widthFor("service_charge")} class="px-2 py-1">
                    <input type="number" step="0.01" class={`${inputClass} w-full`} value={row.service_charge} onInput={(e) => updateRow(index(), { service_charge: e.currentTarget.value })} />
                  </ResizableTd>
                  <ResizableTd width={widthFor("tax_type")} class="px-2 py-1">
                    <input class={`${inputClass} w-full`} value={row.tax_type} onInput={(e) => updateRow(index(), { tax_type: e.currentTarget.value })} />
                  </ResizableTd>
                  <ResizableTd width={widthFor("qty")} class="px-2 py-1">
                    <input type="number" step="0.01" class={`${inputClass} w-full`} value={row.qty} onInput={(e) => updateRow(index(), { qty: e.currentTarget.value })} />
                  </ResizableTd>
                  <ResizableTd width={widthFor("mop")} class="px-2 py-1">
                    <input class={`${inputClass} w-full`} value={row.mop} onInput={(e) => updateRow(index(), { mop: e.currentTarget.value })} />
                  </ResizableTd>
                  <ResizableTd width={widthFor("serial_lot_no")} class="px-2 py-1">
                    <input
                      class={`${inputClass} w-full`}
                      value={row.serial_lot_no}
                      onInput={(e) => updateRow(index(), { serial_lot_no: e.currentTarget.value })}
                      onBlur={(e) => void props.onSerialLotBlur?.(index(), e.currentTarget.value)}
                    />
                  </ResizableTd>
                  <ResizableTd width={widthFor("remark")} class="px-2 py-1">
                    <input class={`${inputClass} w-full`} value={row.remark} onInput={(e) => updateRow(index(), { remark: e.currentTarget.value })} />
                  </ResizableTd>
                  <ResizableTd width={widthFor("actions")} class="px-2 py-1">
                    <Show when={props.lines().length > 1}>
                      <button type="button" class="text-xs text-red-600 hover:underline" onClick={() => removeRow(index())}>
                        Remove
                      </button>
                    </Show>
                  </ResizableTd>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </DataTableScroll>
      <ItemSearchModal open={pickerOpen()} onClose={() => setPickerOpen(false)} onSelect={onPickItem} />
    </div>
  );
}
