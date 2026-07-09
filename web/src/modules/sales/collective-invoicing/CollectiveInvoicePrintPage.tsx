import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import { useParams, useSearchParams } from "@solidjs/router";
import { ProtectedRoute } from "../../../shared/ProtectedRoute";
import { apiFetch } from "../../../shared/api";
import { PrintBrandingHeader } from "../../../shared/branding/PrintBrandingHeader";
import { PrintBrandingFooter } from "../../../shared/branding/PrintBrandingFooter";
import { PrintPageSettingsModal } from "../../../shared/PrintPageSettingsModal";
import { applyPrintPageSettings, loadPrintPageSettings } from "../../../shared/printPageSettings";
import { formatMoney, formatPrintDate, partyContact } from "../sales/salesPrint";
import "../../quotation/quotation/quotationPrint.css";
import { PrintLoading } from "../../../shared/LoadingText";

type InvoicePrintPayload = {
  tenant: { company_name: string };
  partner: { company_name: string; address?: string; phone?: string; mobile?: string; email?: string };
  invoice: {
    date_no_display: string;
    receivable_no?: string;
    display_receivable_no?: string;
    due_date?: string;
    subtotal: number;
    tax_total: number;
    grand_total: number;
    customer_name: string;
  };
  mode: "voucher" | "ar_statement";
  ar?: {
    beginning_ar: number;
    purchases: number;
    ending_ar: number;
    due_date?: string;
    pic_name?: string;
  };
};

type SlipPayload = {
  sales: {
    date_no_display: string;
    sales_no: string;
    pic_name: string;
    lines: {
      line_no?: number;
      item_code?: string;
      item_name: string;
      description?: string;
      qty: number;
      serial_lot_no?: string;
      unit_vat_inc: number;
      unit_non_vat?: number;
      non_vat_total?: number;
      tax_amount?: number;
      line_total?: number;
    }[];
  }[];
};

type CombinedPrintPayload = InvoicePrintPayload & { slip?: SlipPayload };

async function loadCollectiveInvoicePrint(id: number, mode: "voucher" | "ar_statement"): Promise<CombinedPrintPayload> {
  const invoiceRes = await apiFetch<InvoicePrintPayload>(
    `/api/v1/sales/collective-invoices/${id}/print-invoice?mode=${mode}`,
  );
  if (!invoiceRes.success || !invoiceRes.data) {
    throw new Error(invoiceRes.message ?? "Failed to load invoice.");
  }
  if (mode !== "voucher") {
    return invoiceRes.data;
  }
  const slipRes = await apiFetch<SlipPayload>(`/api/v1/sales/collective-invoices/${id}/print-slip`);
  if (!slipRes.success || !slipRes.data) {
    return invoiceRes.data;
  }
  return { ...invoiceRes.data, slip: slipRes.data };
}

function PrintView() {
  const params = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const mode = (): "voucher" | "ar_statement" =>
    searchParams.mode === "ar_statement" ? "ar_statement" : "voucher";

  const [data] = createResource(
    () => ({ id: Number(params.id), mode: mode() }),
    async ({ id, mode: m }) => {
      if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid invoice id.");
      return loadCollectiveInvoicePrint(id, m);
    },
  );

  createEffect(() => {
    applyPrintPageSettings(loadPrintPageSettings());
    if (data()) window.setTimeout(() => window.print(), 500);
  });

  return (
    <div class="quotation-print">
      <div class="no-print mb-4 flex gap-2 p-4">
        <button type="button" class="rounded-lg border border-stroke px-3 py-1.5 text-sm" onClick={() => setSettingsOpen(true)}>Page Settings</button>
        <button type="button" class="rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white" onClick={() => window.print()}>Print</button>
      </div>
      <PrintPageSettingsModal open={settingsOpen()} onClose={() => setSettingsOpen(false)} onConfirm={(s) => applyPrintPageSettings(s)} />
      <Show when={data.loading}><PrintLoading /></Show>
      <Show when={data.error}><p class="quotation-print__error">{String(data.error)}</p></Show>
      <Show when={data()}>
        {(p) => (
          <article class="quotation-print__page">
            <PrintBrandingHeader
              docTitle={p().mode === "ar_statement" ? "A/R STATEMENT" : "SALES INVOICE"}
              tenantFallbackName={p().tenant.company_name}
            />
            <section class="quotation-print__grid">
              <div>
                <h3 class="quotation-print__section">Bill To</h3>
                <dl class="quotation-print__dl">
                  <dt>Name</dt>
                  <dd>{p().partner.company_name}</dd>
                  <Show when={p().partner.address}><dt>Address</dt><dd>{p().partner.address}</dd></Show>
                  <dt>Contact</dt>
                  <dd>{partyContact(p().partner)}</dd>
                </dl>
              </div>
              <div>
                <h3 class="quotation-print__section">Invoice Details</h3>
                <dl class="quotation-print__dl">
                  <dt>Date-No.</dt>
                  <dd>{p().invoice.date_no_display}</dd>
                  <dt>Receivable No.</dt>
                  <dd>{p().invoice.display_receivable_no || p().invoice.receivable_no || "—"}</dd>
                  <Show when={p().invoice.due_date}><dt>Due Date</dt><dd>{formatPrintDate(p().invoice.due_date)}</dd></Show>
                </dl>
              </div>
            </section>
            <Show when={p().mode === "voucher" && p().slip}>
              {(slip) => (
                <section class="my-6">
                  <h3 class="quotation-print__section mb-3">Item breakdown</h3>
                  <For each={slip().sales}>
                    {(sale) => (
                      <div class="mb-4">
                        <h4 class="mb-2 text-sm font-semibold">
                          {sale.date_no_display} · {sale.sales_no} · PIC: {sale.pic_name}
                        </h4>
                        <table class="quotation-print__table w-full text-sm">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Item</th>
                              <th class="text-right">Qty</th>
                              <th>Serial/Lot</th>
                              <th class="text-right">Non-VAT</th>
                              <th class="text-right">Tax</th>
                              <th class="text-right">Line total</th>
                            </tr>
                          </thead>
                          <tbody>
                            <For each={sale.lines}>
                              {(ln, idx) => (
                                <tr>
                                  <td>{ln.line_no ?? idx() + 1}</td>
                                  <td>
                                    {ln.item_code ? `${ln.item_code} — ` : ""}
                                    {ln.item_name}
                                    {ln.description ? ` — ${ln.description}` : ""}
                                  </td>
                                  <td class="text-right">{ln.qty}</td>
                                  <td>{ln.serial_lot_no ?? "—"}</td>
                                  <td class="text-right">{formatMoney(ln.non_vat_total ?? ln.unit_non_vat ?? 0)}</td>
                                  <td class="text-right">{formatMoney(ln.tax_amount ?? 0)}</td>
                                  <td class="text-right">{formatMoney(ln.line_total ?? ln.unit_vat_inc * ln.qty)}</td>
                                </tr>
                              )}
                            </For>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </For>
                </section>
              )}
            </Show>
            <Show when={p().mode === "voucher"}>
              <div class="quotation-print__totals my-6">
                <div class="quotation-print__totals-row"><span>Pretax Amount</span><span>{formatMoney(p().invoice.subtotal)}</span></div>
                <div class="quotation-print__totals-row"><span>Sales Tax</span><span>{formatMoney(p().invoice.tax_total)}</span></div>
                <div class="quotation-print__totals-row"><span>Total Sales</span><span>{formatMoney(p().invoice.grand_total)}</span></div>
              </div>
            </Show>
            <Show when={p().mode === "ar_statement" && p().ar}>
              {(ar) => (
                <table class="quotation-print__table w-full text-sm">
                  <tbody>
                    <tr><td>Beginning A/R</td><td class="text-right">{formatMoney(ar().beginning_ar)}</td></tr>
                    <tr><td>Purchases (this invoice)</td><td class="text-right">{formatMoney(ar().purchases)}</td></tr>
                    <tr><td><strong>Ending A/R</strong></td><td class="text-right"><strong>{formatMoney(ar().ending_ar)}</strong></td></tr>
                    <Show when={ar().due_date}><tr><td>Due Date</td><td class="text-right">{formatPrintDate(ar().due_date)}</td></tr></Show>
                    <Show when={ar().pic_name}><tr><td>PIC</td><td class="text-right">{ar().pic_name}</td></tr></Show>
                  </tbody>
                </table>
              )}
            </Show>
            <PrintBrandingFooter class="quotation-print__footer" />
          </article>
        )}
      </Show>
    </div>
  );
}

export default function CollectiveInvoicePrintPage() {
  return (
    <ProtectedRoute>
      <PrintView />
    </ProtectedRoute>
  );
}
