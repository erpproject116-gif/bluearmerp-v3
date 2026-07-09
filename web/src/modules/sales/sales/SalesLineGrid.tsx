import { createMemo, createSignal, For, Index, Show, onCleanup } from "solid-js";
import type { Accessor, Setter } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { DecimalInput } from "../../../shared/DecimalInput";
import { formatAmount, parseNum } from "../../../shared/money";
import { SerialLineCell } from "../../../shared/SerialLineCell";
import { LotLineCell } from "../../../shared/LotLineCell";
import { resolveItemRate } from "../../../shared/useResolveItemRate";
import type { ItemSearchRow } from "../../../shared/ItemSearchModal";
import { defaultInputBasis, type TaxTypeMeta } from "../../../shared/taxcalc";
import { inputClass } from "../../../shared/SpreadsheetGrid";
import { DataTableScroll, ResizableTd, ResizableTh } from "../../../shared/ResizableTable";
import { useResizableColumns } from "../../../shared/useResizableColumns";
import { filterTaxLineColumns } from "../../../shared/taxLineGrid";
import { SalesItemSearchModal } from "./SalesItemSearchModal";

export type SalesTemplateCode = "default" | "non_vat" | "vat_included";

export type SalesLineRow = {
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
  discount_amount: string;
  remark: string;
  serial_lot_no: string;
  serial_unit_ids?: number[];
  track_serial?: boolean;
  track_lot?: boolean;
  lot_batch_id?: number | null;
  lot_no?: string;
  source_sales_order_line_id?: number | null;
};

export function hasDiscountTemplate(templateCode: SalesTemplateCode): boolean {
  return templateCode === "non_vat" || templateCode === "vat_included";
}

export function emptySalesLine(
  lineNo: number,
  salesPrice = "",
  inputBasis: SalesLineRow["input_basis"] = "vat_inc_unit",
): SalesLineRow {
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
    discount_amount: "",
    remark: "",
    serial_lot_no: "",
    source_sales_order_line_id: null,
  };
}

type GridColumn = { key: string; header: string; width: number };

const BASE_COLUMNS: GridColumn[] = [
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
];

const DISCOUNT_COLUMNS: GridColumn[] = [{ key: "discount_amount", header: "Discount", width: 100 }];

const SERIAL_LOT_COLUMN: GridColumn = { key: "serials", header: "Serial / Lot", width: 160 };

const TAIL_COLUMNS: GridColumn[] = [
  { key: "remark", header: "Remark", width: 120 },
  { key: "actions", header: "", width: 72 },
];

export async function previewSalesLineAmounts(
  taxTypeId: number,
  line: Pick<SalesLineRow, "qty" | "unit_price" | "input_basis">,
): Promise<Partial<SalesLineRow>> {
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

async function previewLineWithDiscount(
  taxTypeId: number,
  line: SalesLineRow,
  templateCode: SalesTemplateCode,
): Promise<Partial<SalesLineRow>> {
  const amounts = await previewSalesLineAmounts(taxTypeId, line);
  if (!hasDiscountTemplate(templateCode)) return amounts;

  const qty = parseNum(line.qty);
  const discount = parseNum(line.discount_amount);
  if (discount <= 0 || qty <= 0) return amounts;

  const unitNonVat = parseNum(amounts.unit_non_vat ?? line.unit_non_vat);
  const perUnitDiscount = discount / qty;
  const discountedUnit = Math.max(0, unitNonVat - perUnitDiscount);
  if (discountedUnit <= 0) {
    return {
      unit_non_vat: "0",
      non_vat_total: "0",
      tax_amount: "0",
      unit_vat_inc: "0",
      line_total: "0",
    };
  }

  return previewSalesLineAmounts(taxTypeId, {
    qty: line.qty,
    unit_price: String(discountedUnit),
    input_basis: "non_vat_unit",
  });
}

export async function recalculateSalesLines(
  lines: SalesLineRow[],
  taxTypeId: number,
  taxMeta: TaxTypeMeta,
  templateCode: SalesTemplateCode,
): Promise<SalesLineRow[]> {
  const basis = defaultInputBasis(taxMeta.tax_mode);
  return Promise.all(
    lines.map(async (ln) => {
      const merged: SalesLineRow = { ...ln, input_basis: basis };
      if (parseNum(merged.qty) <= 0 || parseNum(merged.unit_price) <= 0) return merged;
      const amounts = await previewLineWithDiscount(taxTypeId, merged, templateCode);
      return { ...merged, ...amounts };
    }),
  );
}

type Props = {
  lines: Accessor<SalesLineRow[]>;
  onChange: Setter<SalesLineRow[]>;
  taxTypeId: () => number | null;
  taxTypeMeta: () => TaxTypeMeta | null;
  locationId: () => number | null;
  templateCode: () => SalesTemplateCode;
  partnerId?: () => number | null;
  onCreateShippingOrder?: (line: SalesLineRow, idx: number) => void;
};

export function SalesLineGrid(props: Props) {
  const [searchOpen, setSearchOpen] = createSignal(false);
  const [searchLineIdx, setSearchLineIdx] = createSignal<number | null>(null);
  const columns = createMemo(() => {
    props.taxTypeId();
    const taxCols = filterTaxLineColumns(BASE_COLUMNS, props.taxTypeMeta()?.tax_mode);
    const cols = [...taxCols];
    if (hasDiscountTemplate(props.templateCode())) cols.push(...DISCOUNT_COLUMNS);
    cols.push(SERIAL_LOT_COLUMN);
    cols.push(...TAIL_COLUMNS);
    return cols;
  });
  const hasCol = (key: string) => columns().some((c) => c.key === key);

  const { widthFor, onResizeStart, tableWidth } = useResizableColumns(() =>
    columns().map((c) => ({ key: c.key, width: c.width })),
  );

  const previewLine = async (line: SalesLineRow): Promise<Partial<SalesLineRow>> => {
    const taxId = props.taxTypeId();
    if (!taxId) return {};
    return previewLineWithDiscount(taxId, line, props.templateCode());
  };

  const previewTimers = new Map<number, ReturnType<typeof setTimeout>>();

  const schedulePreview = (idx: number) => {
    const prev = previewTimers.get(idx);
    if (prev) clearTimeout(prev);
    previewTimers.set(
      idx,
      setTimeout(() => {
        previewTimers.delete(idx);
        const line = props.lines()[idx];
        if (!line) return;
        void previewLine(line).then((amounts) => {
          props.onChange((prevLines) => prevLines.map((ln, i) => (i === idx ? { ...ln, ...amounts } : ln)));
        });
      }, 300),
    );
  };

  onCleanup(() => {
    for (const timer of previewTimers.values()) clearTimeout(timer);
    previewTimers.clear();
  });

  const updateLine = (idx: number, patch: Partial<SalesLineRow>) => {
    const next = props.lines().map((ln, i) => (i === idx ? { ...ln, ...patch } : ln));
    props.onChange(next);
    if (
      patch.qty !== undefined ||
      patch.unit_price !== undefined ||
      patch.input_basis !== undefined ||
      patch.discount_amount !== undefined
    ) {
      schedulePreview(idx);
    }
  };

  const addLine = () => {
    const meta = props.taxTypeMeta();
    const basis = meta ? defaultInputBasis(meta.tax_mode) : "vat_inc_unit";
    props.onChange([...props.lines(), emptySalesLine(props.lines().length + 1, "", basis)]);
  };

  const removeLine = (idx: number) => {
    const meta = props.taxTypeMeta();
    const basis = meta ? defaultInputBasis(meta.tax_mode) : "vat_inc_unit";
    const next = props.lines().filter((_, i) => i !== idx).map((ln, i) => ({ ...ln, line_no: i + 1 }));
    props.onChange(next.length ? next : [emptySalesLine(1, "", basis)]);
  };

  const openSearch = (idx: number) => {
    setSearchLineIdx(idx);
    setSearchOpen(true);
  };

  const applyItems = async (items: ItemSearchRow[]) => {
    const idx = searchLineIdx();
    if (idx == null) return;
    const meta = props.taxTypeMeta();
    const basis = meta ? defaultInputBasis(meta.tax_mode) : "vat_inc_unit";
    const pid = props.partnerId?.() ?? null;
    const current = [...props.lines()];
    const first = items[0];
    const rate0 = (await resolveItemRate(pid, first.id)) ?? first.sales_price ?? 0;
    current[idx] = {
      ...current[idx],
      item_id: first.id,
      item_code: first.item_code,
      item_name: first.item_name,
      unit_price: String(rate0),
      input_basis: basis,
      track_serial: Boolean(first.track_serial),
      track_lot: Boolean(first.track_lot),
      serial_unit_ids: [],
      serial_lot_no: "",
      lot_batch_id: null,
      lot_no: "",
    };
    for (let i = 1; i < items.length; i++) {
      const it = items[i];
      const rate = (await resolveItemRate(pid, it.id)) ?? it.sales_price ?? 0;
      current.push(emptySalesLine(current.length + 1, String(rate), basis));
      const last = current.length - 1;
      current[last] = {
        ...current[last],
        item_id: it.id,
        item_code: it.item_code,
        item_name: it.item_name,
        track_serial: Boolean(it.track_serial),
        track_lot: Boolean(it.track_lot),
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

  const isNumericCol = (key: string) =>
    key.includes("unit") || key === "qty" || key === "tax" || key === "line_total" || key === "non_vat_total" || key === "discount_amount";

  const footerColSpanBeforeQty = () => 4;

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
              <For each={columns()}>
                {(c) => (
                  <ResizableTh
                    columnKey={c.key}
                    width={widthFor(c.key)}
                    onResizeStart={onResizeStart}
                    resizable={c.key !== "actions"}
                    class={`px-2 py-2${isNumericCol(c.key) ? " text-right" : ""}`}
                  >
                    {c.header}
                  </ResizableTh>
                )}
              </For>
            </tr>
          </thead>
          <tbody>
            <Index each={props.lines()}>
              {(line, idx) => (
                <tr>
                  <ResizableTd width={widthFor("line_no")} class="px-2 py-1">{line().line_no}</ResizableTd>
                  <ResizableTd width={widthFor("item_code")} class="px-2 py-1">
                    <input
                      class={`${inputClass} w-full cursor-pointer`}
                      value={line().item_code}
                      readOnly
                      onDblClick={() => openSearch(idx)}
                      title="Double-click to search items"
                    />
                  </ResizableTd>
                  <ResizableTd width={widthFor("item_name")} class="px-2 py-1">
                    <input class={`${inputClass} w-full`} value={line().item_name} onInput={(e) => void updateLine(idx, { item_name: e.currentTarget.value })} />
                  </ResizableTd>
                  <ResizableTd width={widthFor("description")} class="px-2 py-1">
                    <input class={`${inputClass} w-full`} value={line().description} onInput={(e) => void updateLine(idx, { description: e.currentTarget.value })} />
                  </ResizableTd>
                  <ResizableTd width={widthFor("qty")} class="px-2 py-1">
                    <DecimalInput mode="qty" class={`${inputClass} w-full text-right`} value={line().qty} onValue={(v) => void updateLine(idx, { qty: v })} />
                  </ResizableTd>
                  <Show when={hasCol("basis")}>
                    <ResizableTd width={widthFor("basis")} class="px-2 py-1">
                      <select
                        class={inputClass}
                        value={line().input_basis}
                        onChange={(e) => void updateLine(idx, { input_basis: e.currentTarget.value as SalesLineRow["input_basis"] })}
                      >
                        <option value="vat_inc_unit">VAT inc.</option>
                        <option value="non_vat_unit">Non-VAT</option>
                      </select>
                    </ResizableTd>
                  </Show>
                  <ResizableTd width={widthFor("unit_price")} class="px-2 py-1">
                    <DecimalInput class={`${inputClass} w-full text-right`} value={line().unit_price} onValue={(v) => void updateLine(idx, { unit_price: v })} />
                  </ResizableTd>
                  <Show when={hasCol("unit_non_vat")}>
                    <ResizableTd width={widthFor("unit_non_vat")} class="px-2 py-1 text-right">{formatAmount(parseNum(line().unit_non_vat))}</ResizableTd>
                  </Show>
                  <Show when={hasCol("non_vat_total")}>
                    <ResizableTd width={widthFor("non_vat_total")} class="px-2 py-1 text-right">{formatAmount(parseNum(line().non_vat_total))}</ResizableTd>
                  </Show>
                  <Show when={hasCol("tax")}>
                    <ResizableTd width={widthFor("tax")} class="px-2 py-1 text-right">{formatAmount(parseNum(line().tax_amount))}</ResizableTd>
                  </Show>
                  <Show when={hasCol("unit_vat_inc")}>
                    <ResizableTd width={widthFor("unit_vat_inc")} class="px-2 py-1 text-right">{formatAmount(parseNum(line().unit_vat_inc))}</ResizableTd>
                  </Show>
                  <ResizableTd width={widthFor("line_total")} class="px-2 py-1 text-right">{formatAmount(parseNum(line().line_total))}</ResizableTd>
                  <Show when={hasDiscountTemplate(props.templateCode())}>
                    <ResizableTd width={widthFor("discount_amount")} class="px-2 py-1">
                      <DecimalInput class={`${inputClass} w-full text-right`} value={line().discount_amount} onValue={(v) => void updateLine(idx, { discount_amount: v })} />
                    </ResizableTd>
                  </Show>
                  <ResizableTd width={widthFor("serials")} class="px-2 py-1">
                    <Show when={line().item_id && line().track_serial}>
                      <SerialLineCell
                        mode="units"
                        itemId={line().item_id}
                        itemCode={line().item_code}
                        itemName={line().item_name}
                        locationId={props.locationId()}
                        qty={parseNum(line().qty)}
                        serialUnitIds={line().serial_unit_ids ?? []}
                        serialLabels={line().serial_lot_no}
                        context="sale"
                        onChange={(ids, labels, qty) => {
                          void updateLine(idx, {
                            serial_unit_ids: ids,
                            serial_lot_no: labels,
                            qty: qty ?? String(ids.length),
                          });
                        }}
                      />
                    </Show>
                    <Show when={line().item_id && line().track_lot && !line().track_serial}>
                      <LotLineCell
                        itemId={line().item_id!}
                        locationId={props.locationId()}
                        lotBatchId={line().lot_batch_id}
                        lotNo={line().lot_no}
                        onChange={(lotBatchId, lotNo) => {
                          void updateLine(idx, { lot_batch_id: lotBatchId, lot_no: lotNo, serial_lot_no: lotNo });
                        }}
                      />
                    </Show>
                    <Show when={!line().item_id || (!line().track_serial && !line().track_lot)}>
                      <span class="text-xs text-text-secondary">—</span>
                    </Show>
                  </ResizableTd>
                  <ResizableTd width={widthFor("remark")} class="px-2 py-1">
                    <input class={`${inputClass} w-full`} value={line().remark} onInput={(e) => void updateLine(idx, { remark: e.currentTarget.value })} />
                  </ResizableTd>
                  <ResizableTd width={widthFor("actions")} class="px-2 py-1">
                    <div class="flex flex-col gap-0.5">
                      <Show when={line().source_sales_order_line_id && props.onCreateShippingOrder}>
                        <button
                          type="button"
                          class="text-xs text-brand-700 hover:underline text-left"
                          onClick={() => props.onCreateShippingOrder!(line(), idx)}
                        >
                          Ship
                        </button>
                      </Show>
                      <button type="button" class="text-xs text-red-600 hover:underline text-left" onClick={() => removeLine(idx)}>
                        Remove
                      </button>
                    </div>
                  </ResizableTd>
                </tr>
              )}
            </Index>
          </tbody>
          <tfoot class="bg-slate-50 font-semibold">
            <tr>
              <td colSpan={footerColSpanBeforeQty()} class="px-2 py-2 text-right">
                Totals
              </td>
              <td class="px-2 py-2 text-right">{totals().qty.toLocaleString("en-PH", { maximumFractionDigits: 4 })}</td>
              <Show when={hasCol("basis")}>
                <td />
              </Show>
              <td />
              <Show when={hasCol("non_vat_total")}>
                <td class="px-2 py-2 text-right">{formatAmount(totals().nonVat)}</td>
              </Show>
              <Show when={hasCol("tax")}>
                <td class="px-2 py-2 text-right">{formatAmount(totals().tax)}</td>
              </Show>
              <Show when={hasCol("unit_vat_inc")}>
                <td />
              </Show>
              <td class="px-2 py-2 text-right">{formatAmount(totals().grand)}</td>
              <Show when={hasDiscountTemplate(props.templateCode())}>
                <td />
              </Show>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </DataTableScroll>

      <SalesItemSearchModal
        open={searchOpen()}
        contextLocationId={props.locationId()}
        onClose={() => setSearchOpen(false)}
        onConfirm={applyItems}
      />

    </div>
  );
}
