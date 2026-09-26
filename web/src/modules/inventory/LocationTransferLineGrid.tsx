import { Index, Show } from "solid-js";
import { lineViewKey, useColumnLabelSettings } from "../../shared/useColumnLabelSettings";
import type { Accessor, Setter } from "solid-js";
import { apiFetch } from "../../shared/api";
import { LookupCombo, type LookupOption } from "../../shared/LookupCombo";
import { LotLineCell } from "../../shared/LotLineCell";
import { SerialLineCell } from "../../shared/SerialLineCell";
import { inputClass } from "../../shared/SpreadsheetGrid";

export type LocationTransferLineRow = {
  line_no: number;
  item_id: number | null;
  item_label: string;
  item_code?: string;
  item_name?: string;
  qty: string;
  remark: string;
  track_serial?: boolean;
  track_lot?: boolean;
  serial_policy?: string;
  lot_policy?: string;
  serial_unit_ids?: number[];
  serial_labels?: string;
  lot_batch_id?: number | null;
  lot_no?: string;
};

export function emptyTransferLine(lineNo: number): LocationTransferLineRow {
  return {
    line_no: lineNo,
    item_id: null,
    item_label: "",
    qty: "1",
    remark: "",
    serial_unit_ids: [],
    serial_labels: "",
    lot_batch_id: null,
    lot_no: "",
  };
}

type ItemLookup = {
  id: number;
  item_code: string;
  item_name: string;
  track_serial?: boolean;
  track_lot?: boolean;
  serial_policy?: string;
  lot_policy?: string;
};

async function fetchItems(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<ItemLookup[]>(`/api/v1/inventory/items?${qs}`);
  return (res.data ?? []).map((i) => ({
    id: i.id,
    label: `${i.item_code} — ${i.item_name}`,
    meta: {
      item_code: i.item_code,
      item_name: i.item_name,
      track_serial: Boolean(i.track_serial),
      track_lot: Boolean(i.track_lot),
      serial_policy: i.serial_policy ?? "required",
      lot_policy: i.lot_policy ?? "required",
    },
  }));
}

function trackingCount(line: LocationTransferLineRow): number {
  if (line.track_serial) return line.serial_unit_ids?.length ?? 0;
  if (line.track_lot && line.lot_batch_id) return 1;
  return 0;
}

type Props = {
  lines: Accessor<LocationTransferLineRow[]>;
  onChange: Setter<LocationTransferLineRow[]>;
  fromLocationId: Accessor<number | null>;
  disabled?: boolean;
  errors?: Record<string, string | undefined>;
};

export function LocationTransferLineGrid(props: Props) {
  const lineLabels = useColumnLabelSettings(lineViewKey("inv_stock_entry"));
  const col = (key: string, fallback: string) => lineLabels.columnLabel(key, fallback);
  const show = (key: string) => lineLabels.isColumnVisible(key, true);
  const updateLine = (index: number, patch: Partial<LocationTransferLineRow>) => {
    props.onChange((prev) => prev.map((ln, i) => (i === index ? { ...ln, ...patch } : ln)));
  };

  const addLine = () => {
    props.onChange((prev) => [...prev, emptyTransferLine(prev.length + 1)]);
  };

  const removeLine = (index: number) => {
    props.onChange((prev) =>
      prev.filter((_, i) => i !== index).map((ln, i) => ({ ...ln, line_no: i + 1 })),
    );
  };

  return (
    <div class="col-span-full space-y-2">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-sm font-semibold text-text-primary">Line items</h3>
          <p class="text-xs text-text-secondary">
            Quantity out and quantity in are the same item quantity. Serial / lot is a tracking count only.
          </p>
        </div>
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
              <th class="px-2 py-2">{col("line_no", "#")}</th>
              <th class="px-2 py-2" classList={{ hidden: !show("item") }}>{col("item", "Item")}</th>
              <th class="px-2 py-2 text-right" classList={{ hidden: !show("qty_out") }}>{col("qty_out", "Quantity out")}</th>
              <th class="px-2 py-2 text-right" classList={{ hidden: !show("qty_in") }}>{col("qty_in", "Quantity in")}</th>
              <th class="px-2 py-2" classList={{ hidden: !show("serial_lot") }}>{col("serial_lot", "Serial / lot")}</th>
              <th class="px-2 py-2 text-right" classList={{ hidden: !show("count") }}>{col("count", "Count")}</th>
              <th class="px-2 py-2" classList={{ hidden: !show("remark") }}>{col("remark", "Remark")}</th>
              <th class="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            <Index each={props.lines()}>
              {(line, index) => (
                <tr class="border-t border-stroke/60">
                  <td class="px-2 py-1.5 tabular-nums text-text-secondary">{line().line_no}</td>
                  <td class="min-w-[14rem] px-2 py-1.5" classList={{ hidden: !show("item") }}>
                    <LookupCombo
                      label=""
                      value={() => line().item_label}
                      selectedId={() => line().item_id}
                      error={props.errors?.[`lines[${index}].item_id`]}
                      disabled={props.disabled}
                      onInput={(v) => updateLine(index, { item_label: v })}
                      onSelect={(o) => {
                        const meta = o.meta ?? {};
                        updateLine(index, {
                          item_id: o.id,
                          item_label: o.label,
                          item_code: String(meta.item_code ?? ""),
                          item_name: String(meta.item_name ?? ""),
                          track_serial: Boolean(meta.track_serial),
                          track_lot: Boolean(meta.track_lot),
                          serial_policy: String(meta.serial_policy ?? "required"),
                          lot_policy: String(meta.lot_policy ?? "required"),
                          serial_unit_ids: [],
                          serial_labels: "",
                          lot_batch_id: null,
                          lot_no: "",
                        });
                      }}
                      onClear={() =>
                        updateLine(index, {
                          item_id: null,
                          item_label: "",
                          track_serial: false,
                          track_lot: false,
                          serial_unit_ids: [],
                          serial_labels: "",
                          lot_batch_id: null,
                          lot_no: "",
                        })
                      }
                      fetchOptions={fetchItems}
                    />
                  </td>
                  <td class="px-2 py-1.5" classList={{ hidden: !show("qty_out") }}>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      class={`${inputClass} text-right`}
                      value={line().qty}
                      disabled={props.disabled}
                      onInput={(e) => updateLine(index, { qty: e.currentTarget.value })}
                    />
                  </td>
                  <td class="px-2 py-1.5 text-right tabular-nums text-text-secondary" classList={{ hidden: !show("qty_in") }}>
                    {line().qty || "—"}
                  </td>
                  <td class="min-w-[10rem] px-2 py-1.5" classList={{ hidden: !show("serial_lot") }}>
                    <Show when={line().item_id && line().track_serial}>
                      <SerialLineCell
                        mode="units"
                        itemId={line().item_id}
                        itemCode={line().item_code}
                        itemName={line().item_name}
                        locationId={props.fromLocationId()}
                        qty={Number(line().qty) || 1}
                        serialUnitIds={line().serial_unit_ids ?? []}
                        serialLabels={line().serial_labels}
                        disabled={props.disabled || !props.fromLocationId()}
                        onChange={(ids, labels, qty) => {
                          updateLine(index, {
                            serial_unit_ids: ids,
                            serial_labels: labels,
                            qty: qty ?? String(ids.length || line().qty),
                            lot_batch_id: null,
                            lot_no: "",
                          });
                        }}
                      />
                    </Show>
                    <Show when={line().item_id && line().track_lot && !line().track_serial}>
                      <LotLineCell
                        itemId={line().item_id!}
                        locationId={props.fromLocationId()}
                        lotBatchId={line().lot_batch_id}
                        lotNo={line().lot_no}
                        disabled={props.disabled || !props.fromLocationId()}
                        onChange={(lotBatchId, lotNo) => {
                          updateLine(index, {
                            lot_batch_id: lotBatchId,
                            lot_no: lotNo,
                            serial_unit_ids: [],
                            serial_labels: "",
                          });
                        }}
                      />
                    </Show>
                    <Show when={line().item_id && !line().track_serial && !line().track_lot}>
                      <span class="text-xs text-text-secondary">Not tracked</span>
                    </Show>
                    <Show when={!line().item_id}>
                      <span class="text-xs text-text-secondary">—</span>
                    </Show>
                  </td>
                  <td class="px-2 py-1.5 text-right tabular-nums text-text-secondary" classList={{ hidden: !show("count") }}>
                    {trackingCount(line()) > 0 ? trackingCount(line()) : "—"}
                  </td>
                  <td class="min-w-[10rem] px-2 py-1.5" classList={{ hidden: !show("remark") }}>
                    <input
                      class={inputClass}
                      value={line().remark}
                      disabled={props.disabled}
                      placeholder="Optional"
                      onInput={(e) => updateLine(index, { remark: e.currentTarget.value })}
                    />
                  </td>
                  <td class="px-2 py-1.5">
                    <Show when={!props.disabled && props.lines().length > 1}>
                      <button type="button" class="text-xs text-red-600 hover:underline" onClick={() => removeLine(index)}>
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
