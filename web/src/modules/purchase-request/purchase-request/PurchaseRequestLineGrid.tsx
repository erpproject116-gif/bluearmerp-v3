import { createMemo, createSignal, Index, Show, onCleanup } from "solid-js";
import type { Accessor, Setter } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { DecimalInput } from "../../../shared/DecimalInput";
import { formatAmount, parseNum } from "../../../shared/money";
import { ItemSearchModal, type ItemSearchRow } from "../../../shared/ItemSearchModal";
import { resolveInventoryItemByCode } from "../../../shared/resolveInventoryItemByCode";
import { defaultInputBasis, type TaxTypeMeta } from "../../../shared/taxcalc";
import { inputClass } from "../../../shared/SpreadsheetGrid";
import { DataTableScroll, ResizableTd, ResizableTh } from "../../../shared/ResizableTable";
import { useResizableColumns } from "../../../shared/useResizableColumns";
import { filterTaxLineColumns } from "../../../shared/taxLineGrid";
import { applyColumnLabels, lineViewKey, useColumnLabelSettings } from "../../../shared/useColumnLabelSettings";
import { uiLabel } from "../../../shared/branding/uiLabel";
import { PURCHASE_REQUEST_ENTITY } from "../../../shared/entityTypes";
import { LineUnitSelect } from "../../../shared/LineUnitSelect";
import { PartnerSearchModal, type PartnerSearchRow } from "./PartnerSearchModal";
import { SerialCellHint, SerialLineCell } from "../../../shared/SerialLineCell";
import { DocumentSerialScanBar } from "../../../shared/DocumentSerialScanBar";
import type { ResolvedSerialUnit } from "../../../shared/serialScanTypes";
import { useToast } from "../../../shared/toast";
import {
  WARRANTY_MONTH_OPTIONS,
  WARRANTY_YEAR_OPTIONS,
  warrantyFromParts,
  warrantyMonthsPart,
  warrantyYearsPart,
} from "../../../shared/warrantyDurationParts";

export type PurchaseRequestLineRow = {
  /** Persisted PO/PR line id when editing an existing document. */
  id?: number | null;
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
  unit_id?: number | null;
  unit_code?: string;
  unit_price: string;
  input_basis: "vat_inc_unit" | "non_vat_unit";
  unit_non_vat: string;
  non_vat_total: string;
  tax_amount: string;
  unit_vat_inc: string;
  line_total: string;
  remark: string;
  /** Total months (years×12 + months). Used on PO / Purchase Receive lines. */
  warranty_duration_months?: number | null;
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
    unit_id: null,
    unit_code: "",
    unit_price: salesPrice,
    input_basis: inputBasis,
    unit_non_vat: "",
    non_vat_total: "",
    tax_amount: "",
    unit_vat_inc: "",
    line_total: "",
    remark: "",
    warranty_duration_months: 0,
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
  { key: "unit", header: "UoM", width: 80 },
  { key: "basis", header: "Basis", width: 100 },
  { key: "unit_price", header: "Unit Price", width: 100 },
  { key: "unit_non_vat", header: "Unit (Non-VAT)", width: 110 },
  { key: "non_vat_total", header: "Non-VAT Total", width: 110 },
  { key: "tax", header: "Tax", width: 90 },
  { key: "unit_vat_inc", header: "Unit (VAT inc.)", width: 110 },
  { key: "line_total", header: "Line Total", width: 110 },
  { key: "warranty", header: "Warranty", width: 140 },
  { key: "serials", header: "Serials", width: 180 },
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
  /**
   * planned: PR-style optional serials (may sync qty from count).
   * bill: New Bill — scan-next, qty-first (do not overwrite qty from serial length).
   */
  serialCaptureMode?: "planned" | "bill";
  /**
   * When true, Warranty may appear if Settings → Line columns has it Visible.
   * Defaults hidden via column-label DefaultHidden for PO / Purchase Receive.
   */
  showWarrantyColumns?: boolean;
};

export function PurchaseRequestLineGrid(props: Props) {
  const toast = useToast();
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

  const applyItem = (item: ItemSearchRow, atIdx?: number | null) => {
    const idx = atIdx ?? itemSearchLineIdx();
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
            unit_id: item.base_unit_id ?? null,
            unit_code: item.base_unit_code ?? "",
            unit_price: String(item.sales_price ?? 0),
            input_basis: basis,
            track_serial: Boolean(item.track_serial),
            serial_policy: item.serial_policy ?? "required",
            planned_serial_nos: [],
            warranty_duration_months: item.warranty_duration_months ?? 0,
          }
        : ln,
    );
    props.onChange(next);
    void previewLine(next[idx]).then((amounts) => {
      props.onChange((prev) => prev.map((ln, i) => (i === idx ? { ...ln, ...amounts } : ln)));
    });
  };

  const resolveItemCode = async (idx: number, rawCode: string) => {
    const code = rawCode.trim();
    if (!code) return;
    const current = props.lines()[idx];
    if (
      current?.item_id &&
      (current.item_code || "").trim().toLowerCase() === code.toLowerCase()
    ) {
      return;
    }
    const { item, error } = await resolveInventoryItemByCode(code);
    if (error) {
      toast.warning(error);
      return;
    }
    if (item) applyItem(item, idx);
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
    const labelsByKey = lineLabels.byKey();
    const base = filterTaxLineColumns(LINE_COLUMNS, props.taxTypeMeta()?.tax_mode);
    let filtered = !props.hidePartnerColumns
      ? [...base]
      : base.filter((c) => c.key !== "partner_code" && c.key !== "partner_name");
    // Warranty only on PO / Purchase Receive (showWarrantyColumns), and only when Settings → Visible.
    filtered = filtered.filter((c) => {
      if (c.key === "warranty") {
        if (!props.showWarrantyColumns) return false;
        const row = labelsByKey["warranty"];
        if (!row || row.is_visible === undefined) return false;
        return row.is_visible !== false;
      }
      const row = labelsByKey[c.key];
      if (!row || row.is_visible === undefined) return true;
      return row.is_visible !== false;
    });
    return applyColumnLabels(filtered, lineLabels.columnLabel);
  });
  const hasCol = (key: string) => columns().some((c) => c.key === key);
  const footerColSpanBeforeQty = () => {
    const qtyIdx = columns().findIndex((c) => c.key === "qty");
    return qtyIdx > 0 ? qtyIdx : 1;
  };

  const applySerialUnits = (units: ResolvedSerialUnit[], preferLineIdx?: number) => {
    const meta = props.taxTypeMeta();
    const basis = meta ? defaultInputBasis(meta.tax_mode) : "vat_inc_unit";
    let current = [...props.lines()];
    let added = 0;

    for (const u of units) {
      const sn = u.serial_no;
      const already = current.some((ln) => (ln.planned_serial_nos ?? []).some((p) => p.toLowerCase() === sn.toLowerCase()));
      if (already) {
        toast.warning(`${sn} is already on this document.`);
        continue;
      }

      if (preferLineIdx != null && preferLineIdx >= 0 && preferLineIdx < current.length) {
        const pref = current[preferLineIdx];
        const prefEmpty = !pref.item_id && !(pref.item_code || "").trim();
        const prefSame = pref.item_id === u.item_id && Boolean(pref.track_serial || prefEmpty);
        if (prefEmpty || prefSame) {
          if (prefEmpty) {
            current[preferLineIdx] = {
              ...pref,
              item_id: u.item_id,
              item_code: u.item_code,
              item_name: u.item_name,
              unit_price: "0",
              input_basis: basis,
              track_serial: true,
              serial_policy: "required",
              planned_serial_nos: [sn],
              qty: "1",
            };
          } else {
            const serials = [...(pref.planned_serial_nos ?? []), sn];
            current[preferLineIdx] = {
              ...pref,
              planned_serial_nos: serials,
              qty: String(serials.length),
              track_serial: true,
            };
          }
          added++;
          continue;
        }
      }

      const sameItemIdx = current.findIndex((ln) => ln.item_id === u.item_id && Boolean(ln.track_serial));
      if (sameItemIdx >= 0) {
        const ln = current[sameItemIdx];
        const serials = [...(ln.planned_serial_nos ?? []), sn];
        current[sameItemIdx] = {
          ...ln,
          planned_serial_nos: serials,
          qty: String(serials.length),
          track_serial: true,
        };
        added++;
        continue;
      }

      const emptyIdx = current.findIndex((ln) => !ln.item_id && !(ln.item_code || "").trim());
      const patch: Partial<PurchaseRequestLineRow> = {
        item_id: u.item_id,
        item_code: u.item_code,
        item_name: u.item_name,
        unit_price: "0",
        input_basis: basis,
        track_serial: true,
        serial_policy: "required",
        planned_serial_nos: [sn],
        qty: "1",
      };
      if (emptyIdx >= 0) {
        current[emptyIdx] = { ...current[emptyIdx], ...patch };
      } else {
        current.push({ ...emptyPurchaseRequestLine(current.length + 1, "0", basis), ...patch });
      }
      added++;
    }

    if (added === 0) return;
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
    toast.success(added === 1 ? "Line updated from serial." : `${added} lines updated from serials.`);
  };

  const { widthFor, onResizeStart, tableWidth } = useResizableColumns(() =>
    columns().map((c) => ({ key: c.key, width: c.width })),
  );

  return (
    <div class="col-span-full">
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 class="text-sm font-semibold text-text-primary">{uiLabel("lines.heading")}</h3>
          <p class="text-xs text-text-secondary">
            Unregistered products are allowed on purchase requests — type a registered code and press Tab/Enter to auto-fill, or double-click Item Code to search. Registration is required from Purchase Order onward.
          </p>
        </div>
        <button type="button" class="rounded border border-stroke px-2 py-1 text-xs hover:bg-slate-50" onClick={addLine}>
          {uiLabel("lines.add_button")}
        </button>
      </div>
      <DocumentSerialScanBar
        locationId={null}
        context="purchase"
        placeholder="Scan serial no. — Enter fills item + planned serial"
        onUnits={applySerialUnits}
        onUnregistered={(sn) => {
          // Unknown serial (new supplier stock): if exactly one serial-tracked line
          // already has an item, attach it there as a planned serial. Otherwise let
          // the bar show the fix guidance (we can't guess the item).
          const current = props.lines();
          const candidates = current
            .map((ln, i) => ({ ln, i }))
            .filter(({ ln }) => ln.item_id && Boolean(ln.track_serial));
          if (candidates.length !== 1) return false;
          const { ln, i } = candidates[0];
          if ((ln.planned_serial_nos ?? []).some((p) => p.toLowerCase() === sn.toLowerCase())) {
            toast.warning(`${sn} is already on this document.`);
            return true;
          }
          const serials = [...(ln.planned_serial_nos ?? []), sn];
          const next = current.map((row, idx) =>
            idx === i ? { ...row, planned_serial_nos: serials, qty: String(serials.length) } : row,
          );
          props.onChange(next);
          toast.success(`Added ${sn} to ${ln.item_code || "the item line"}.`);
          return true;
        }}
      />
      <Show when={!props.taxTypeId()}>
        <p class="mb-2 text-xs text-amber-700">{uiLabel("lines.tax_hint")}</p>
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
                  class={`px-2 py-2${c.key !== "unit" && (c.key.includes("unit") || c.key === "qty" || c.key === "tax" || c.key === "line_total" || c.key === "non_vat_total") ? " text-right" : ""}`}
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
                        title={uiLabel("lines.partner_search_hint")}
                      />
                    </ResizableTd>
                    <ResizableTd width={widthFor("partner_name")} class="px-2 py-1">
                      <input
                        class={`${inputClass} w-full cursor-pointer`}
                        value={line().partner_name}
                        readOnly
                        onDblClick={() => openPartnerSearch(idx)}
                        title={uiLabel("lines.partner_search_hint")}
                      />
                    </ResizableTd>
                  </Show>
                  <ResizableTd width={widthFor("item_code")} class="px-2 py-1">
                    <input
                      class={`${inputClass} w-full`}
                      value={line().item_code}
                      placeholder="Code or dbl-click to search"
                      title="Type a registered code and Tab/Enter to auto-fill, or double-click to search"
                      onDblClick={() => openItemSearch(idx)}
                      onInput={(e) =>
                        void updateLine(idx, {
                          item_code: e.currentTarget.value,
                          item_id: null,
                          track_serial: false,
                          planned_serial_nos: [],
                        })
                      }
                      onBlur={(e) => void resolveItemCode(idx, e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void resolveItemCode(idx, e.currentTarget.value);
                        }
                      }}
                    />
                  </ResizableTd>
                  <ResizableTd width={widthFor("item_name")} class="px-2 py-1">
                    <input
                      class={`${inputClass} w-full`}
                      value={line().item_name}
                      placeholder="Product name (required if not in inventory)"
                      onInput={(e) =>
                        void updateLine(idx, {
                          item_name: e.currentTarget.value,
                          item_id: null,
                          track_serial: false,
                          planned_serial_nos: [],
                        })
                      }
                    />
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
                  <ResizableTd width={widthFor("unit")} class="px-2 py-1">
                    <LineUnitSelect
                      unitId={line().unit_id}
                      unitCode={line().unit_code}
                      onChange={(u) => void updateLine(idx, { unit_id: u.unit_id, unit_code: u.unit_code })}
                    />
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
                  <Show when={hasCol("warranty")}>
                    <ResizableTd width={widthFor("warranty")} class="px-2 py-1">
                      <div class="flex items-center gap-1" title="Unit warranty duration (years + months)">
                        <select
                          class={`${inputClass} w-[3.25rem] px-1`}
                          aria-label="Warranty years"
                          value={String(warrantyYearsPart(line().warranty_duration_months))}
                          onChange={(e) =>
                            void updateLine(idx, {
                              warranty_duration_months: warrantyFromParts(
                                Number(e.currentTarget.value),
                                warrantyMonthsPart(line().warranty_duration_months),
                              ),
                            })
                          }
                        >
                          {WARRANTY_YEAR_OPTIONS.map((y) => (
                            <option value={y}>{y}y</option>
                          ))}
                        </select>
                        <select
                          class={`${inputClass} w-[3.25rem] px-1`}
                          aria-label="Warranty months"
                          value={String(warrantyMonthsPart(line().warranty_duration_months))}
                          onChange={(e) =>
                            void updateLine(idx, {
                              warranty_duration_months: warrantyFromParts(
                                warrantyYearsPart(line().warranty_duration_months),
                                Number(e.currentTarget.value),
                              ),
                            })
                          }
                        >
                          {WARRANTY_MONTH_OPTIONS.map((m) => (
                            <option value={m}>{m}m</option>
                          ))}
                        </select>
                      </div>
                    </ResizableTd>
                  </Show>
                  <ResizableTd width={widthFor("serials")} class="px-2 py-1">
                    <Show
                      when={!line().item_id || line().track_serial}
                      fallback={<SerialCellHint hasItem={Boolean(line().item_id)} />}
                    >
                      <div class="space-y-1">
                        <Show when={line().item_id && line().track_serial && props.serialCaptureMode !== "bill"}>
                          <p class="text-[10px] uppercase tracking-wide text-text-secondary">
                            Planned · optional on purchase request
                          </p>
                        </Show>
                        <Show when={!line().item_id && props.serialCaptureMode !== "bill"}>
                          <p class="text-[10px] uppercase tracking-wide text-text-secondary">Scan serial</p>
                        </Show>
                        <SerialLineCell
                          mode="planned"
                          qty={parseNum(line().qty) || 1}
                          plannedSerials={line().planned_serial_nos ?? []}
                          entryMode={props.serialCaptureMode === "bill" ? "scan-next" : "bulk-edit"}
                          hint={
                            props.serialCaptureMode === "bill" && line().item_id && line().track_serial
                              ? "Qty first · serial count must match"
                              : undefined
                          }
                          onChange={(serials) => {
                            if (props.serialCaptureMode === "bill") {
                              void updateLine(idx, { planned_serial_nos: serials });
                              return;
                            }
                            void updateLine(idx, {
                              planned_serial_nos: serials,
                              qty: serials.length > 0 ? String(serials.length) : line().qty,
                            });
                          }}
                          onPopulateFromUnits={
                            props.serialCaptureMode === "bill" ? undefined : (units) => applySerialUnits(units, idx)
                          }
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
              <td />
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
              <td colSpan={hasCol("warranty") ? 4 : 3} />
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
