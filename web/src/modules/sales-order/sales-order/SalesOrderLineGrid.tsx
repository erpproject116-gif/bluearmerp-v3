import { createMemo, createSignal, For, Show } from "solid-js";
import type { Accessor, Setter } from "solid-js";
import { apiFetch } from "../../../shared/api";
import type { ItemSearchRow } from "../../../shared/ItemSearchModal";
import { defaultInputBasis, type TaxTypeMeta } from "../../../shared/taxcalc";
import { inputClass } from "../../../shared/SpreadsheetGrid";
import { DataTableScroll, ResizableTd, ResizableTh } from "../../../shared/ResizableTable";
import { useResizableColumns } from "../../../shared/useResizableColumns";
import { filterTaxLineColumns } from "../../../shared/taxLineGrid";
import { SalesOrderItemSearchModal } from "./SalesOrderItemSearchModal";

export type SalesOrderLineRow = {
  line_no: number;
  item_id?: number | null;
  item_code: string;
  item_name: string;
  description: string;
  qty: string;
  unit_price: string;
  input_basis: "vat_inc_unit" | "non_vat_unit";
  unit_non_vat: string;
  non_vat_total: string;
  tax_amount: string;
  unit_vat_inc: string;
  line_total: string;
  remark: string;
  source_quotation_line_id?: number | null;
};

export function emptySalesOrderLine(
  lineNo: number,
  salesPrice = "",
  inputBasis: SalesOrderLineRow["input_basis"] = "vat_inc_unit",
): SalesOrderLineRow {
  return {
    line_no: lineNo,
    item_id: null,
    item_code: "",
    item_name: "",
    description: "",
    qty: "1",
    unit_price: salesPrice,
    input_basis: inputBasis,
    unit_non_vat: "",
    non_vat_total: "",
    tax_amount: "",
    unit_vat_inc: "",
    line_total: "",
    remark: "",
    source_quotation_line_id: null,
  };
}

function parseNum(s: string) {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function money(n: number) {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const SALES_ORDER_LINE_COLUMNS = [
  { key: "line_no", header: "#", width: 40 },
  { key: "item_code", header: "Item Code", width: 100 },
  { key: "item_name", header: "Item Name", width: 140 },
  { key: "description", header: "Description", width: 140 },
  { key: "qty", header: "Qty", width: 72 },
  { key: "basis", header: "Basis", width: 100 },
  { key: "unit_price", header: "Unit Price", width: 100 },
  { key: "unit_non_vat", header: "Unit (Non-VAT)", width: 110 },
  { key: "non_vat_total", header: "Non-VAT Total", width: 110 },
  { key: "tax", header: "Tax", width: 90 },
  { key: "unit_vat_inc", header: "Unit (VAT inc.)", width: 110 },
  { key: "line_total", header: "Line Total", width: 110 },
  { key: "remark", header: "Remark", width: 120 },
  { key: "actions", header: "", width: 72 },
] as const;

export async function previewSalesOrderLineAmounts(
  taxTypeId: number,
  line: Pick<SalesOrderLineRow, "qty" | "unit_price" | "input_basis">,
): Promise<Partial<SalesOrderLineRow>> {
  if (parseNum(line.qty) <= 0 || parseNum(line.unit_price) <= 0) return {};
  const res = await apiFetch<{
    unit_non_vat: number;
    non_vat_total: number;
    tax_amount: number;
    unit_vat_inc: number;
    line_total: number;
  }>(`/api/v1/quotation/tax-types/${taxTypeId}/preview`, {
    method: "POST",
    body: JSON.stringify({
      unit_price: parseNum(line.unit_price),
      qty: parseNum(line.qty),
      input_basis: line.input_basis,
    }),
  });
  if (!res.success || !res.data) return {};
  const d = res.data;
  return {
    unit_non_vat: String(d.unit_non_vat),
    non_vat_total: String(d.non_vat_total),
    tax_amount: String(d.tax_amount),
    unit_vat_inc: String(d.unit_vat_inc),
    line_total: String(d.line_total),
  };
}

export async function recalculateSalesOrderLines(
  lines: SalesOrderLineRow[],
  taxTypeId: number,
  taxMeta: TaxTypeMeta,
): Promise<SalesOrderLineRow[]> {
  const basis = defaultInputBasis(taxMeta.tax_mode);
  return Promise.all(
    lines.map(async (ln) => {
      const merged: SalesOrderLineRow = { ...ln, input_basis: basis };
      if (parseNum(merged.qty) <= 0 || parseNum(merged.unit_price) <= 0) return merged;
      const amounts = await previewSalesOrderLineAmounts(taxTypeId, merged);
      return { ...merged, ...amounts };
    }),
  );
}

type Props = {
  lines: Accessor<SalesOrderLineRow[]>;
  onChange: Setter<SalesOrderLineRow[]>;
  taxTypeId: () => number | null;
  taxTypeMeta: () => TaxTypeMeta | null;
  locationId: () => number | null;
};

export function SalesOrderLineGrid(props: Props) {
  const [searchOpen, setSearchOpen] = createSignal(false);
  const [searchLineIdx, setSearchLineIdx] = createSignal<number | null>(null);

  const previewLine = async (line: SalesOrderLineRow): Promise<Partial<SalesOrderLineRow>> => {
    const taxId = props.taxTypeId();
    if (!taxId) return {};
    return previewSalesOrderLineAmounts(taxId, line);
  };

  const updateLine = async (idx: number, patch: Partial<SalesOrderLineRow>) => {
    const next = props.lines().map((ln, i) => (i === idx ? { ...ln, ...patch } : ln));
    props.onChange(next);
    const merged = next[idx];
    if (patch.qty !== undefined || patch.unit_price !== undefined || patch.input_basis !== undefined) {
      const amounts = await previewLine(merged);
      props.onChange(next.map((ln, i) => (i === idx ? { ...ln, ...amounts } : ln)));
    }
  };

  const addLine = () => {
    const meta = props.taxTypeMeta();
    const basis = meta ? defaultInputBasis(meta.tax_mode) : "vat_inc_unit";
    props.onChange([...props.lines(), emptySalesOrderLine(props.lines().length + 1, "", basis)]);
  };

  const removeLine = (idx: number) => {
    const meta = props.taxTypeMeta();
    const basis = meta ? defaultInputBasis(meta.tax_mode) : "vat_inc_unit";
    const next = props.lines().filter((_, i) => i !== idx).map((ln, i) => ({ ...ln, line_no: i + 1 }));
    props.onChange(next.length ? next : [emptySalesOrderLine(1, "", basis)]);
  };

  const openSearch = (idx: number) => {
    setSearchLineIdx(idx);
    setSearchOpen(true);
  };

  const applyItems = (items: ItemSearchRow[]) => {
    const idx = searchLineIdx();
    if (idx == null) return;
    const meta = props.taxTypeMeta();
    const basis = meta ? defaultInputBasis(meta.tax_mode) : "vat_inc_unit";
    const current = [...props.lines()];
    const first = items[0];
    current[idx] = {
      ...current[idx],
      item_id: first.id,
      item_code: first.item_code,
      item_name: first.item_name,
      unit_price: String(first.sales_price ?? 0),
      input_basis: basis,
    };
    for (let i = 1; i < items.length; i++) {
      const it = items[i];
      current.push(emptySalesOrderLine(current.length + 1, String(it.sales_price ?? 0), basis));
      const last = current.length - 1;
      current[last] = {
        ...current[last],
        item_id: it.id,
        item_code: it.item_code,
        item_name: it.item_name,
      };
    }
    const numbered = current.map((ln, i) => ({ ...ln, line_no: i + 1 }));
    props.onChange(numbered);
    void Promise.all(numbered.map((ln, i) => previewLine(ln).then((amounts) => ({ i, amounts })))).then((results) => {
      props.onChange((prev) =>
        prev.map((ln, i) => {
          const hit = results.find((r) => r.i === i);
          return hit ? { ...ln, ...hit.amounts } : ln;
        }),
      );
    });
  };

  const totals = () => {
    const lines = props.lines();
    return {
      qty: lines.reduce((s, ln) => s + parseNum(ln.qty), 0),
      nonVat: lines.reduce((s, ln) => s + parseNum(ln.non_vat_total), 0),
      tax: lines.reduce((s, ln) => s + parseNum(ln.tax_amount), 0),
      grand: lines.reduce((s, ln) => s + parseNum(ln.line_total), 0),
    };
  };

  const columns = createMemo(() => {
    props.taxTypeId();
    return filterTaxLineColumns(SALES_ORDER_LINE_COLUMNS, props.taxTypeMeta()?.tax_mode);
  });
  const hasCol = (key: string) => columns().some((c) => c.key === key);

  const { widthFor, onResizeStart, tableWidth } = useResizableColumns(() =>
    columns().map((c) => ({ key: c.key, width: c.width })),
  );

  return (
    <div class="col-span-full">
      <div class="mb-2 flex items-center justify-between">
        <h3 class="text-sm font-semibold text-text-primary">Line items</h3>
        <button type="button" class="rounded border border-stroke px-2 py-1 text-xs hover:bg-slate-50" onClick={addLine}>
          + Line
        </button>
      </div>
      <Show when={!props.taxTypeId()}>
        <p class="mb-2 text-xs text-amber-700">Select a transaction type to apply tax rates to line amounts.</p>
      </Show>
      <DataTableScroll class="rounded-lg border border-stroke">
        <table class="erp-grid text-xs" style={{ width: `${tableWidth()}px`, "min-width": "100%" }}>
          <thead class="bg-slate-50 text-left uppercase text-text-secondary">
            <tr>
              {columns().map((c) => (
                <ResizableTh
                  columnKey={c.key}
                  width={widthFor(c.key)}
                  onResizeStart={onResizeStart}
                  resizable={c.key !== "actions"}
                  class={`px-2 py-2${c.key.includes("unit") || c.key === "qty" || c.key === "tax" || c.key === "line_total" || c.key === "non_vat_total" ? " text-right" : ""}`}
                >
                  {c.header}
                </ResizableTh>
              ))}
            </tr>
          </thead>
          <tbody>
            <For each={props.lines()}>
              {(line, idx) => (
                <tr>
                  <ResizableTd width={widthFor("line_no")} class="px-2 py-1">{line.line_no}</ResizableTd>
                  <ResizableTd width={widthFor("item_code")} class="px-2 py-1">
                    <input
                      class={`${inputClass} w-full cursor-pointer`}
                      value={line.item_code}
                      readOnly
                      onDblClick={() => openSearch(idx())}
                      title="Double-click to search items"
                    />
                  </ResizableTd>
                  <ResizableTd width={widthFor("item_name")} class="px-2 py-1">
                    <input class={`${inputClass} w-full`} value={line.item_name} onInput={(e) => void updateLine(idx(), { item_name: e.currentTarget.value })} />
                  </ResizableTd>
                  <ResizableTd width={widthFor("description")} class="px-2 py-1">
                    <input class={`${inputClass} w-full`} value={line.description} onInput={(e) => void updateLine(idx(), { description: e.currentTarget.value })} />
                  </ResizableTd>
                  <ResizableTd width={widthFor("qty")} class="px-2 py-1">
                    <input type="number" class={`${inputClass} w-full text-right`} value={line.qty} onInput={(e) => void updateLine(idx(), { qty: e.currentTarget.value })} />
                  </ResizableTd>
                  <Show when={hasCol("basis")}>
                    <ResizableTd width={widthFor("basis")} class="px-2 py-1">
                      <select
                        class={inputClass}
                        value={line.input_basis}
                        onChange={(e) => void updateLine(idx(), { input_basis: e.currentTarget.value as SalesOrderLineRow["input_basis"] })}
                      >
                        <option value="vat_inc_unit">VAT inc.</option>
                        <option value="non_vat_unit">Non-VAT</option>
                      </select>
                    </ResizableTd>
                  </Show>
                  <ResizableTd width={widthFor("unit_price")} class="px-2 py-1">
                    <input type="number" class={`${inputClass} w-full text-right`} value={line.unit_price} onInput={(e) => void updateLine(idx(), { unit_price: e.currentTarget.value })} />
                  </ResizableTd>
                  <Show when={hasCol("unit_non_vat")}>
                    <ResizableTd width={widthFor("unit_non_vat")} class="px-2 py-1 text-right">{money(parseNum(line.unit_non_vat))}</ResizableTd>
                  </Show>
                  <Show when={hasCol("non_vat_total")}>
                    <ResizableTd width={widthFor("non_vat_total")} class="px-2 py-1 text-right">{money(parseNum(line.non_vat_total))}</ResizableTd>
                  </Show>
                  <Show when={hasCol("tax")}>
                    <ResizableTd width={widthFor("tax")} class="px-2 py-1 text-right">{money(parseNum(line.tax_amount))}</ResizableTd>
                  </Show>
                  <Show when={hasCol("unit_vat_inc")}>
                    <ResizableTd width={widthFor("unit_vat_inc")} class="px-2 py-1 text-right">{money(parseNum(line.unit_vat_inc))}</ResizableTd>
                  </Show>
                  <ResizableTd width={widthFor("line_total")} class="px-2 py-1 text-right">{money(parseNum(line.line_total))}</ResizableTd>
                  <ResizableTd width={widthFor("remark")} class="px-2 py-1">
                    <input class={`${inputClass} w-full`} value={line.remark} onInput={(e) => void updateLine(idx(), { remark: e.currentTarget.value })} />
                  </ResizableTd>
                  <ResizableTd width={widthFor("actions")} class="px-2 py-1">
                    <button type="button" class="text-xs text-red-600 hover:underline" onClick={() => removeLine(idx())}>
                      Remove
                    </button>
                  </ResizableTd>
                </tr>
              )}
            </For>
          </tbody>
          <tfoot class="bg-slate-50 font-semibold">
            <tr>
              <td colSpan={4} class="px-2 py-2 text-right">
                Totals
              </td>
              <td class="px-2 py-2 text-right">{totals().qty.toLocaleString("en-PH", { maximumFractionDigits: 4 })}</td>
              <Show when={hasCol("basis")}>
                <td />
              </Show>
              <td />
              <Show when={hasCol("non_vat_total")}>
                <td class="px-2 py-2 text-right">{money(totals().nonVat)}</td>
              </Show>
              <Show when={hasCol("tax")}>
                <td class="px-2 py-2 text-right">{money(totals().tax)}</td>
              </Show>
              <Show when={hasCol("unit_vat_inc")}>
                <td />
              </Show>
              <td class="px-2 py-2 text-right">{money(totals().grand)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </DataTableScroll>

      <SalesOrderItemSearchModal
        open={searchOpen()}
        contextLocationId={props.locationId()}
        onClose={() => setSearchOpen(false)}
        onConfirm={applyItems}
      />
    </div>
  );
}
