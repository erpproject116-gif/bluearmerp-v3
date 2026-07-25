import { For, Show } from "solid-js";
import type { DocumentLineRow } from "./documentLinePrint";
import { formatPeso } from "./money";
import { formatMoney } from "../modules/sales/sales/salesPrint";

type Props = {
  lines: DocumentLineRow[];
  currencyCode?: string;
  /** When true, amounts use document currency instead of peso symbol only. */
  useDocumentCurrency?: boolean;
};

function formatAmount(amount: number, currencyCode?: string, useDocumentCurrency?: boolean) {
  if (useDocumentCurrency && currencyCode) return formatMoney(amount, currencyCode);
  return formatPeso(amount);
}

export function InvoiceLineItemsTable(props: Props) {
  const money = (amount: number) => formatAmount(amount, props.currencyCode, props.useDocumentCurrency);
  const hasUnitCode = () => props.lines.some((ln) => (ln.unit_code ?? "").trim() !== "");

  return (
    <div class="rounded-lg border border-stroke bg-white">
      <div class="border-b border-stroke px-4 py-2">
        <h3 class="text-sm font-semibold text-text-primary">Item breakdown</h3>
        <p class="text-xs text-text-secondary">Same lines as on the sale or purchase document.</p>
      </div>
      <Show
        when={props.lines.length > 0}
        fallback={<p class="px-4 py-3 text-sm text-text-secondary">No line items on this document.</p>}
      >
        <div class="overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead class="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">
              <tr>
                <th class="px-3 py-2">#</th>
                <th class="px-3 py-2">Item code</th>
                <th class="px-3 py-2">Description</th>
                <th class="px-3 py-2 text-right">Qty</th>
                <Show when={hasUnitCode()}>
                  <th class="px-3 py-2">UoM</th>
                </Show>
                <th class="px-3 py-2 text-right">Unit price (non-VAT)</th>
                <th class="px-3 py-2 text-right">Non-VAT total</th>
                <th class="px-3 py-2 text-right">Tax</th>
                <th class="px-3 py-2 text-right">Line total</th>
              </tr>
            </thead>
            <tbody>
              <For each={props.lines}>
                {(ln) => (
                  <tr class="border-t border-stroke">
                    <td class="px-3 py-2">{ln.line_no}</td>
                    <td class="px-3 py-2 whitespace-nowrap">{ln.item_code || "—"}</td>
                    <td class="px-3 py-2">
                      {ln.item_name}
                      <Show when={ln.description}>
                        <span class="text-text-secondary"> — {ln.description}</span>
                      </Show>
                    </td>
                    <td class="px-3 py-2 text-right">{ln.qty ?? 0}</td>
                    <Show when={hasUnitCode()}>
                      <td class="px-3 py-2">{ln.unit_code || "—"}</td>
                    </Show>
                    <td class="px-3 py-2 text-right">{money(ln.unit_non_vat ?? 0)}</td>
                    <td class="px-3 py-2 text-right">{money(ln.non_vat_total ?? 0)}</td>
                    <td class="px-3 py-2 text-right">{money(ln.tax_amount ?? 0)}</td>
                    <td class="px-3 py-2 text-right font-medium">{money(ln.line_total ?? 0)}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
    </div>
  );
}
