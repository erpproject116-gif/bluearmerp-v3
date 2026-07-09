import { createMemo, createSignal, Index, Show, onCleanup } from "solid-js";
import type { Accessor, Setter } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { DecimalInput } from "../../../shared/DecimalInput";
import { formatAmount, parseNum } from "../../../shared/money";
import { ItemSearchModal, type ItemSearchRow } from "../../../shared/ItemSearchModal";
import { defaultInputBasis, type TaxTypeMeta } from "../../../shared/taxcalc";
import { inputClass } from "../../../shared/SpreadsheetGrid";
import { DataTableScroll, ResizableTd, ResizableTh } from "../../../shared/ResizableTable";
import { useResizableColumns } from "../../../shared/useResizableColumns";
import { filterTaxLineColumns } from "../../../shared/taxLineGrid";
import { applyColumnLabels, lineViewKey, useColumnLabelSettings } from "../../../shared/useColumnLabelSettings";
import { PURCHASE_REQUEST_ENTITY } from "../../../shared/entityTypes";
import { PartnerSearchModal, type PartnerSearchRow } from "./PartnerSearchModal";
import { SerialLineCell } from "../../../shared/SerialLineCell";
import { trackingPolicyLabel } from "../../../shared/itemMasterConstants";

export type PurchaseRequestLineRow = {
  line_no: number;
  partner_id?: number | null;
  partner_code: string;
  partner_name: string;
  item_id?: number | null;
  item_code: string;
  item_name: string;
  spec_name: string;
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
  source_sales_order_line_id?: number | null;
  purchase_request_line_id?: number | null;
  supplier_quotation_line_id?: number | null;
  rfq_request_line_id?: number | null;
  goods_receipt_line_id?: number | null;
  purchase_order_line_id?: number | null;
  track_serial?: boolean;
  serial_policy?: string;
  planned_serial_nos?: string[];
};

export function emptyPurchaseRequestLine(
  lineNo: number,
  salesPrice = "",
  inputBasis: PurchaseRequestLineRow["input_basis"] = "vat_inc_unit",
): PurchaseRequestLineRow {
  return {
    line_no: lineNo,
    partner_id: null,
    partner_code: "",
    partner_name: "",
    item_id: null,
    item_code: "",
    item_name: "",
    spec_name: "",
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
  };
}

const LINE_COLUMNS = [
  { key: "line_no", header: "#", width: 40 },
  { key: "partner_code", header: "Partner Code", width: 100 },
  { key: "partner_name", header: "Partner Name", width: 130 },
  { key: "item_code", header: "Item Code", width: 100 },
  { key: "item_name", header: "Item Name", width: 130 },
  { key: "spec_name", header: "Spec Name", width: 110 },
  { key: "description", header: "Description", width: 120 },
  { key: "qty", header: "Qty", width: 72 },
  { key: "basis", header: "Basis", width: 100 },
  { key: "unit_price", header: "Unit Price", width: 100 },
  { key: "unit_non_vat", header: "Unit (Non-VAT)", width: 110 },
  { key: "non_vat_total", header: "Non-VAT Total", width: 110 },
  { key: "tax", header: "Tax", width: 90 },
  { key: "unit_vat_inc", header: "Unit (VAT inc.)", width: 110 },
  { key: "line_total", header: "Line Total", width: 110 },
  { key: "serials", header: "Planned Serials", width: 150 },
  { key: "remark", header: "Remark", width: 100 },
  { key: "actions", header: "", width: 72 },
] as const;

export async function previewPurchaseRequestLineAmounts(
  taxTypeId: number,
  line: Pick<PurchaseRequestLineRow, "qty" | "unit_price" | "input_basis">,
): Promise<Partial<PurchaseRequestLineRow>> {
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

export async function recalculatePurchaseRequestLines(
  lines: PurchaseRequestLineRow[],
  taxTypeId: number,
  taxMeta: TaxTypeMeta,
): Promise<PurchaseRequestLineRow[]> {
  const basis = defaultInputBasis(taxMeta.tax_mode);
  return Promise.all(
    lines.map(async (ln) => {
      const merged: PurchaseRequestLineRow = { ...ln, input_basis: basis };
      if (parseNum(merged.qty) <= 0 || parseNum(merged.unit_price) <= 0) return merged;
      const amounts = await previewPurchaseRequestLineAmounts(taxTypeId, merged);
      return { ...merged, ...amounts };
    }),
  );
}

type Props = {
  lines: Accessor<PurchaseRequestLineRow[]>;
  onChange: Setter<PurchaseRequestLineRow[]>;
  taxTypeId: () => number | null;
  taxTypeMeta: () => TaxTypeMeta | null;
  locationId: () => number | null;
  /** Override line column label view (e.g. po_purchase_order, fin_supplier_invoice). */
  lineViewKey?: string;
  /** Hide per-line partner columns (e.g. purchase order uses header vendor). */
  hidePartnerColumns?: boolean;
};

export function PurchaseRequestLineGrid(props: Props) {
  const [itemSearchOpen, setItemSearchOpen] = createSignal(false);
  const [itemSearchLineIdx, setItemSearchLineIdx] = createSignal<number | null>(null);
  const [partnerSearchOpen, setPartnerSearchOpen] = createSignal(false);
  const [partnerSearchLineIdx, setPartnerSearchLineIdx] = createSignal<number | null>(null);

  const previewLine = async (line: PurchaseRequestLineRow): Promise<Partial<PurchaseRequestLineRow>> => {
    const taxId = props.taxTypeId();
    if (!taxId) return {};
    return previewPurchaseRequestLineAmounts(taxId, line);
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

  const updateLine = (idx: number, patch: Partial<PurchaseRequestLineRow>) => {
    const next = props.lines().map((ln, i) => (i === idx ? { ...ln, ...patch } : ln));
    props.onChange(next);
    if (patch.qty !== undefined || patch.unit_price !== undefined || patch.input_basis !== undefined) {
      schedulePreview(idx);
    }
  };

  const addLine = () => {
    const meta = props.taxTypeMeta();
    const basis = meta ? defaultInputBasis(meta.tax_mode) : "vat_inc_unit";
    props.onChange([...props.lines(), emptyPurchaseRequestLine(props.lines().length + 1, "", basis)]);
  };

  const removeLine = (idx: number) => {
    const meta = props.taxTypeMeta();
    const basis = meta ? defaultInputBasis(meta.tax_mode) : "vat_inc_unit";
    const next = props.lines().filter((_, i) => i !== idx).map((ln, i) => ({ ...ln, line_no: i + 1 }));
    props.onChange(next.length ? next : [emptyPurchaseRequestLine(1, "", basis)]);
  };

  const openItemSearch = (idx: number) => {
    setItemSearchLineIdx(idx);
    setItemSearchOpen(true);
  };

  const openPartnerSearch = (idx: number) => {
    setPartnerSearchLineIdx(idx);
    setPartnerSearchOpen(true);
  };

  const applyItem = (item: ItemSearchRow) => {
    const idx = itemSearchLineIdx();
    if (idx == null) return;
    const meta = props.taxTypeMeta();
    const basis = meta ? defaultInputBasis(meta.tax_mode) : "vat_inc_unit";
    const next = props.lines().map((ln, i) =>
      i === idx
        ? {
            ...ln,
            item_id: item.id,
            item_code: item.item_code,
            item_name: item.item_name,
            spec_name: item.spec_name ?? "",
            unit_price: String(item.sales_price ?? 0),
            input_basis: basis,
            track_serial: Boolean(item.track_serial),
            serial_policy: item.serial_policy ?? "required",
            planned_serial_nos: [],
          }
        : ln,
    );
    props.onChange(next);
    void previewLine(next[idx]).then((amounts) => {
      props.onChange((prev) => prev.map((ln, i) => (i === idx ? { ...ln, ...amounts } : ln)));
    });
  };

  const applyPartner = (partner: PartnerSearchRow) => {
    const idx = partnerSearchLineIdx();
    if (idx == null) return;
    props.onChange(
      props.lines().map((ln, i) =>
        i === idx
          ? {
              ...ln,
              partner_id: partner.id,
              partner_code: partner.partner_code,
              partner_name: partner.company_name,
            }
          : ln,
      ),
    );
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

  const viewKey = () => props.lineViewKey ?? lineViewKey(PURCHASE_REQUEST_ENTITY.purchaseRequest);
  const lineLabels = useColumnLabelSettings(viewKey());

  const columns = createMemo(() => {
    props.taxTypeId();
    const base = filterTaxLineColumns(LINE_COLUMNS, props.taxTypeMeta()?.tax_mode);
    const filtered = !props.hidePartnerColumns
      ? base
      : base.filter((c) => c.key !== "partner_code" && c.key !== "partner_name");
    return applyColumnLabels(filtered, lineLabels.columnLabel);
  });
  const hasCol = (key: string) => columns().some((c) => c.key === key);
  const footerColSpanBeforeQty = () => {
    const qtyIdx = columns().findIndex((c) => c.key === "qty");
    return qtyIdx > 0 ? qtyIdx : 1;
  };

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
            <Index each={props.lines()}>
              {(line, idx) => (
                <tr>
                  <ResizableTd width={widthFor("line_no")} class="px-2 py-1">{line().line_no}</ResizableTd>
                  <Show when={!props.hidePartnerColumns}>
                    <ResizableTd width={widthFor("partner_code")} class="px-2 py-1">
                      <input
                        class={`${inputClass} w-full cursor-pointer`}
                        value={line().partner_code}
                        readOnly
                        onDblClick={() => openPartnerSearch(idx)}
                        title="Double-click to search partner"
                      />
                    </ResizableTd>
                    <ResizableTd width={widthFor("partner_name")} class="px-2 py-1">
                      <input
                        class={`${inputClass} w-full cursor-pointer`}
                        value={line().partner_name}
                        readOnly
                        onDblClick={() => openPartnerSearch(idx)}
                        title="Double-click to search partner"
                      />
                    </ResizableTd>
                  </Show>
                  <ResizableTd width={widthFor("item_code")} class="px-2 py-1">
                    <input
                      class={`${inputClass} w-full cursor-pointer`}
                      value={line().item_code}
                      readOnly
                      onDblClick={() => openItemSearch(idx)}
                      title="Double-click to search items"
                    />
                  </ResizableTd>
                  <ResizableTd width={widthFor("item_name")} class="px-2 py-1">
                    <input class={`${inputClass} w-full`} value={line().item_name} onInput={(e) => void updateLine(idx, { item_name: e.currentTarget.value })} />
                  </ResizableTd>
                  <ResizableTd width={widthFor("spec_name")} class="px-2 py-1">
                    <input class={`${inputClass} w-full`} value={line().spec_name} onInput={(e) => void updateLine(idx, { spec_name: e.currentTarget.value })} />
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
                        onChange={(e) => void updateLine(idx, { input_basis: e.currentTarget.value as PurchaseRequestLineRow["input_basis"] })}
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
                  <ResizableTd width={widthFor("serials")} class="px-2 py-1">
                    <Show when={line().item_id && line().track_serial} fallback={<span class="text-xs text-text-secondary">—</span>}>
                      <div class="space-y-1">
                        <p class="text-[10px] uppercase tracking-wide text-text-secondary">
                          Planned · {trackingPolicyLabel(line().serial_policy)}
                        </p>
                        <SerialLineCell
                          mode="planned"
                          qty={parseNum(line().qty)}
                          plannedSerials={line().planned_serial_nos ?? []}
                          onChange={(serials) => void updateLine(idx, { planned_serial_nos: serials })}
                        />
                      </div>
                    </Show>
                  </ResizableTd>
                  <ResizableTd width={widthFor("remark")} class="px-2 py-1">
                    <input class={`${inputClass} w-full`} value={line().remark} onInput={(e) => void updateLine(idx, { remark: e.currentTarget.value })} />
                  </ResizableTd>
                  <ResizableTd width={widthFor("actions")} class="px-2 py-1">
                    <button type="button" class="text-xs text-red-600 hover:underline" onClick={() => removeLine(idx)}>
                      Remove
                    </button>
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
              <Show when={hasCol("unit_non_vat")}>
                <td />
              </Show>
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
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </DataTableScroll>

      <ItemSearchModal
        open={itemSearchOpen()}
        contextLocationId={props.locationId()}
        onClose={() => setItemSearchOpen(false)}
        onSelect={applyItem}
      />
      <Show when={!props.hidePartnerColumns}>
        <PartnerSearchModal open={partnerSearchOpen()} onClose={() => setPartnerSearchOpen(false)} onSelect={applyPartner} />
      </Show>
    </div>
  );
}
