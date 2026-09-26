import { Index, Show } from "solid-js";
import type { Accessor, Setter } from "solid-js";
import { apiFetch } from "../../shared/api";
import { LookupCombo, type LookupOption } from "../../shared/LookupCombo";
import { ModalField } from "../../shared/ModalField";
import { inputClass } from "../../shared/SpreadsheetGrid";
import { fieldVisible, type FormFieldSetting } from "../../shared/useFormFieldSettings";

export type StockAdjustmentLineRow = {
  line_no: number;
  item_id: number | null;
  item_label: string;
  location_id: number | null;
  location_label: string;
  qty_delta: string;
};

export function emptyStockAdjustmentLine(lineNo: number): StockAdjustmentLineRow {
  return {
    line_no: lineNo,
    item_id: null,
    item_label: "",
    location_id: null,
    location_label: "",
    qty_delta: "",
  };
}

async function fetchItems(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; item_code: string; item_name: string }[]>(`/api/v1/inventory/items?${qs}`);
  return (res.data ?? []).map((i) => ({ id: i.id, label: `${i.item_code} — ${i.item_name}` }));
}

async function fetchLocations(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; location_name: string }[]>(`/api/v1/inventory/locations?${qs}`);
  return (res.data ?? []).map((l) => ({ id: l.id, label: l.location_name }));
}

type Props = {
  lines: Accessor<StockAdjustmentLineRow[]>;
  onChange: Setter<StockAdjustmentLineRow[]>;
  disabled?: boolean;
  settings: () => Record<string, FormFieldSetting>;
};

export function StockAdjustmentLineGrid(props: Props) {
  const updateLine = (index: number, patch: Partial<StockAdjustmentLineRow>) => {
    props.onChange((prev) => prev.map((ln, i) => (i === index ? { ...ln, ...patch } : ln)));
  };

  const addLine = () => {
    props.onChange((prev) => [...prev, emptyStockAdjustmentLine(prev.length + 1)]);
  };

  const removeLine = (index: number) => {
    props.onChange((prev) =>
      prev.filter((_, i) => i !== index).map((ln, i) => ({ ...ln, line_no: i + 1 })),
    );
  };

  const header = (key: string, fallback: string) => props.settings()[key]?.label?.trim() || fallback;
  const show = (key: string) => fieldVisible(props.settings()[key], true);

  return (
    <div class="col-span-full space-y-2">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold text-text-primary">Adjustment lines</h3>
        <Show when={!props.disabled}>
          <button type="button" class="rounded border border-stroke px-2 py-1 text-xs hover:bg-slate-50" onClick={addLine}>
            + Line
          </button>
        </Show>
      </div>
      <div class="overflow-x-auto rounded-lg border border-stroke">
        <table class="min-w-full text-left text-sm">
          <thead class="bg-slate-50 text-text-secondary">
            <tr>
              <th class="px-2 py-2">#</th>
              <th class="px-2 py-2" classList={{ hidden: !show("item_id") }}>{header("item_id", "Item")}</th>
              <th class="px-2 py-2" classList={{ hidden: !show("location_id") }}>{header("location_id", "Location")}</th>
              <th class="px-2 py-2" classList={{ hidden: !show("qty_delta") }}>{header("qty_delta", "Quantity change")}</th>
              <th class="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            <Index each={props.lines()}>
              {(line, idx) => (
                <tr class="border-t border-stroke">
                  <td class="px-2 py-2 align-top">{line().line_no}</td>
                  <td class="min-w-[220px] px-2 py-2 align-top" classList={{ hidden: !show("item_id") }}>
                      <ModalField settings={props.settings} fieldKey="item_id" fallbackLabel="Item" fallbackRequired bare>
                        {(m) => (
                          <LookupCombo
                            label=""
                            value={() => line().item_label}
                            selectedId={() => line().item_id}
                            onInput={(v) => updateLine(idx, { item_label: v })}
                            onSelect={(o) => updateLine(idx, { item_id: o.id, item_label: o.label })}
                            onClear={() => updateLine(idx, { item_id: null, item_label: "" })}
                            fetchOptions={fetchItems}
                            disabled={props.disabled || m.disabled}
                          />
                        )}
                      </ModalField>
                    </td>
                    <td class="min-w-[180px] px-2 py-2 align-top" classList={{ hidden: !show("location_id") }}>
                      <ModalField settings={props.settings} fieldKey="location_id" fallbackLabel="Location" fallbackRequired bare>
                        {(m) => (
                          <LookupCombo
                            label=""
                            value={() => line().location_label}
                            selectedId={() => line().location_id}
                            onInput={(v) => updateLine(idx, { location_label: v })}
                            onSelect={(o) => updateLine(idx, { location_id: o.id, location_label: o.label })}
                            onClear={() => updateLine(idx, { location_id: null, location_label: "" })}
                            fetchOptions={fetchLocations}
                            disabled={props.disabled || m.disabled}
                          />
                        )}
                      </ModalField>
                    </td>
                    <td class="min-w-[120px] px-2 py-2 align-top" classList={{ hidden: !show("qty_delta") }}>
                      <ModalField settings={props.settings} fieldKey="qty_delta" fallbackLabel="Quantity change" fallbackRequired bare>
                        {(m) => (
                          <input
                            type="number"
                            step="any"
                            class={inputClass}
                            value={line().qty_delta}
                            disabled={props.disabled || m.disabled}
                            placeholder={m.placeholder}
                            onInput={(e) => updateLine(idx, { qty_delta: e.currentTarget.value })}
                            {...m.inputProps}
                          />
                        )}
                      </ModalField>
                    </td>
                  <td class="px-2 py-2 align-top">
                    <Show when={!props.disabled && props.lines().length > 1}>
                      <button type="button" class="text-xs text-red-600 hover:underline" onClick={() => removeLine(idx)}>
                        Remove
                      </button>
                    </Show>
                  </td>
                </tr>
              )}
            </Index>
          </tbody>
        </table>
      </div>
    </div>
  );
}
