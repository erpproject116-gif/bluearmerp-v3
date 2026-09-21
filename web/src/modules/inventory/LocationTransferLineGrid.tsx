import { Index, Show } from "solid-js";
import type { Accessor, Setter } from "solid-js";
import { apiFetch } from "../../shared/api";
import { LookupCombo, type LookupOption } from "../../shared/LookupCombo";
import { inputClass } from "../../shared/SpreadsheetGrid";

export type LocationTransferLineRow = {
  line_no: number;
  item_id: number | null;
  item_label: string;
  qty: string;
  remark: string;
};

export function emptyTransferLine(lineNo: number): LocationTransferLineRow {
  return { line_no: lineNo, item_id: null, item_label: "", qty: "1", remark: "" };
}

async function fetchItems(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; item_code: string; item_name: string }[]>(`/api/v1/inventory/items?${qs}`);
  return (res.data ?? []).map((i) => ({ id: i.id, label: `${i.item_code} — ${i.item_name}` }));
}

type Props = {
  lines: Accessor<LocationTransferLineRow[]>;
  onChange: Setter<LocationTransferLineRow[]>;
  disabled?: boolean;
  errors?: Record<string, string | undefined>;
};

export function LocationTransferLineGrid(props: Props) {
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
          <p class="text-xs text-text-secondary">Qty out and Qty in are the same item quantity.</p>
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
              <th class="px-2 py-2">#</th>
              <th class="px-2 py-2">Item</th>
              <th class="px-2 py-2 text-right">Qty out</th>
              <th class="px-2 py-2 text-right">Qty in</th>
              <th class="px-2 py-2">Remark</th>
              <th class="px-2 py-2 text-right">Serial/Lot</th>
              <th class="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            <Index each={props.lines()}>
              {(line, index) => (
                <tr class="border-t border-stroke/60">
                  <td class="px-2 py-1.5 tabular-nums text-text-secondary">{line().line_no}</td>
                  <td class="min-w-[14rem] px-2 py-1.5">
                    <LookupCombo
                      label=""
                      value={() => line().item_label}
                      selectedId={() => line().item_id}
                      error={props.errors?.[`lines[${index}].item_id`]}
                      disabled={props.disabled}
                      onInput={(v) => updateLine(index, { item_label: v })}
                      onSelect={(o) => updateLine(index, { item_id: o.id, item_label: o.label })}
                      onClear={() => updateLine(index, { item_id: null, item_label: "" })}
                      fetchOptions={fetchItems}
                    />
                  </td>
                  <td class="px-2 py-1.5">
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
                  <td class="px-2 py-1.5 text-right tabular-nums text-text-secondary">
                    {line().qty || "—"}
                  </td>
                  <td class="min-w-[10rem] px-2 py-1.5">
                    <input
                      class={inputClass}
                      value={line().remark}
                      disabled={props.disabled}
                      placeholder="Optional"
                      onInput={(e) => updateLine(index, { remark: e.currentTarget.value })}
                    />
                  </td>
                  <td class="px-2 py-1.5 text-right tabular-nums text-text-secondary">—</td>
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
