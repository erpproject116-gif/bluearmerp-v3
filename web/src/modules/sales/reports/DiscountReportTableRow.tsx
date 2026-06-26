import { Show } from "solid-js";
import type { SalesDiscountStatusRow } from "../../../shared/useSalesDiscountStatusReport";
import {
  showDiscountColumn,
  visibleDiscountColumnCount,
  type DiscountColumnKey,
  type DiscountColumnVisibility,
} from "./discountStatusColumns";
import type { DiscountReportLine } from "./discountStatusGrouping";
import { formatApvlLine } from "./salesDiscountStatusTemplate";

type Props = {
  line: DiscountReportLine;
  displayApvlLine: boolean;
  columnVisibility: DiscountColumnVisibility;
  money: (n: number) => string;
  variant?: "screen" | "print";
};

function cellClass(screen: boolean, align?: "left" | "right") {
  if (!screen) return align === "right" ? "text-right" : "";
  return align === "right" ? "px-3 py-2 text-right tabular-nums" : "px-3 py-2";
}

export function DiscountReportTableRow(props: Props) {
  const screen = () => props.variant !== "print";
  const show = (key: DiscountColumnKey) =>
    showDiscountColumn(key, props.columnVisibility, props.displayApvlLine);
  const colspan = () => visibleDiscountColumnCount(props.columnVisibility, props.displayApvlLine);

  if (props.line.kind === "group") {
    return screen() ? (
      <tr class="bg-slate-50">
        <td class="px-3 py-2 font-semibold text-text-primary" colSpan={colspan()}>{props.line.label}</td>
      </tr>
    ) : (
      <tr>
        <td colSpan={colspan()}><strong>{props.line.label}</strong></td>
      </tr>
    );
  }

  if (props.line.kind === "subtotal") {
    const labelCols = [show("order_date"), show("customer_name")].filter(Boolean).length || 1;
    return screen() ? (
      <tr class="border-b border-stroke bg-slate-100 font-medium">
        <Show when={show("order_date") || show("customer_name")}>
          <td class="px-3 py-2" colSpan={labelCols}>{props.line.label}</td>
        </Show>
        <Show when={show("sales_amount")}><td class={cellClass(true, "right")}>{props.money(props.line.sales_amount)}</td></Show>
        <Show when={show("invoicing_amount")}><td class={cellClass(true, "right")}>{props.money(props.line.invoicing_amount)}</td></Show>
        <Show when={show("difference_amount")}><td class={cellClass(true, "right")}>{props.money(props.line.difference_amount)}</td></Show>
        <Show when={show("apvl_line")}><td class="px-3 py-2" /></Show>
        <Show when={show("remark")}><td class="px-3 py-2" /></Show>
      </tr>
    ) : (
      <tr>
        <td colSpan={labelCols}><strong>{props.line.label}</strong></td>
        <Show when={show("sales_amount")}><td class="text-right"><strong>{props.money(props.line.sales_amount)}</strong></td></Show>
        <Show when={show("invoicing_amount")}><td class="text-right"><strong>{props.money(props.line.invoicing_amount)}</strong></td></Show>
        <Show when={show("difference_amount")}><td class="text-right"><strong>{props.money(props.line.difference_amount)}</strong></td></Show>
        <Show when={show("apvl_line")}><td /></Show>
        <Show when={show("remark")}><td /></Show>
      </tr>
    );
  }

  const row: SalesDiscountStatusRow = props.line.row;
  return screen() ? (
    <tr class="border-b border-stroke/60">
      <Show when={show("order_date")}><td class="px-3 py-2">{row.date_no_display}</td></Show>
      <Show when={show("customer_name")}><td class="px-3 py-2">{row.customer_name}</td></Show>
      <Show when={show("sales_amount")}><td class={cellClass(true, "right")}>{props.money(row.sales_amount)}</td></Show>
      <Show when={show("invoicing_amount")}><td class={cellClass(true, "right")}>{props.money(row.invoicing_amount)}</td></Show>
      <Show when={show("difference_amount")}><td class={cellClass(true, "right")}>{props.money(row.difference_amount)}</td></Show>
      <Show when={show("apvl_line")}><td class="px-3 py-2">{formatApvlLine(row)}</td></Show>
      <Show when={show("remark")}><td class="px-3 py-2 max-w-xs truncate" title={row.remark}>{row.remark}</td></Show>
    </tr>
  ) : (
    <tr>
      <Show when={show("order_date")}><td>{row.date_no_display}</td></Show>
      <Show when={show("customer_name")}><td>{row.customer_name}</td></Show>
      <Show when={show("sales_amount")}><td class="text-right">{props.money(row.sales_amount)}</td></Show>
      <Show when={show("invoicing_amount")}><td class="text-right">{props.money(row.invoicing_amount)}</td></Show>
      <Show when={show("difference_amount")}><td class="text-right">{props.money(row.difference_amount)}</td></Show>
      <Show when={show("apvl_line")}><td>{formatApvlLine(row)}</td></Show>
      <Show when={show("remark")}><td>{row.remark}</td></Show>
    </tr>
  );
}
