import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import { useParams } from "@solidjs/router";
import { ProtectedRoute } from "../../../shared/ProtectedRoute";
import { apiFetch } from "../../../shared/api";
import { PrintBrandingHeader } from "../../../shared/branding/PrintBrandingHeader";
import { PrintBrandingFooter } from "../../../shared/branding/PrintBrandingFooter";
import { PrintPageSettingsModal } from "../../../shared/PrintPageSettingsModal";
import { applyPrintPageSettings, loadPrintPageSettings } from "../../../shared/printPageSettings";
import { formatMoney, formatPrintDate, partyContact } from "../sales/salesPrint";
import "../../quotation/quotation/quotationPrint.css";

type SlipPayload = {
  tenant: { company_name: string; address?: string; phone?: string; email?: string };
  partner: { company_name: string; address?: string; phone?: string; mobile?: string; email?: string };
  invoice: { date_no_display: string; due_date?: string; grand_total: number; subtotal: number; tax_total: number };
  sales: {
    date_no_display: string;
    sales_no: string;
    pic_name: string;
    lines: { item_name: string; description?: string; qty: number; serial_lot_no?: string; unit_vat_inc: number }[];
  }[];
  totals: { qty: number; subtotal: number; tax_total: number; grand_total: number };
};

function PrintView() {
  const params = useParams<{ id: string }>();
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [data] = createResource(
    () => Number(params.id),
    async (id) => {
      if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid invoice id.");
      const res = await apiFetch<SlipPayload>(`/api/v1/sales/collective-invoices/${id}/print-slip`);
      if (!res.success || !res.data) throw new Error(res.message ?? "Failed to load slip.");
      return res.data;
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
      <Show when={data.loading}><p class="quotation-print__loading">Loading…</p></Show>
      <Show when={data.error}><p class="quotation-print__error">{String(data.error)}</p></Show>
      <Show when={data()}>
        {(p) => (
          <article class="quotation-print__page">
            <PrintBrandingHeader docTitle="SALES SLIP" tenantFallbackName={p().tenant.company_name} />
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
                <h3 class="quotation-print__section">Invoice</h3>
                <dl class="quotation-print__dl">
                  <dt>Date-No.</dt>
                  <dd>{p().invoice.date_no_display}</dd>
                  <Show when={p().invoice.due_date}><dt>Due Date</dt><dd>{formatPrintDate(p().invoice.due_date)}</dd></Show>
                </dl>
              </div>
            </section>
            <For each={p().sales}>
              {(sale) => (
                <section class="mb-4">
                  <h4 class="font-semibold">{sale.date_no_display} · {sale.sales_no} · PIC: {sale.pic_name}</h4>
                  <table class="quotation-print__table w-full text-sm">
                    <thead>
                      <tr>
                        <th>Item Name</th>
                        <th class="text-right">Qty</th>
                        <th>Serial/Lot</th>
                        <th class="text-right">Price (VAT inc.)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={sale.lines}>
                        {(ln) => (
                          <tr>
                            <td>{ln.item_name}{ln.description ? ` — ${ln.description}` : ""}</td>
                            <td class="text-right">{ln.qty}</td>
                            <td>{ln.serial_lot_no ?? "—"}</td>
                            <td class="text-right">{formatMoney(ln.unit_vat_inc)}</td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </section>
              )}
            </For>
            <div class="quotation-print__totals">
              <div class="quotation-print__totals-row"><span>Total Qty</span><span>{p().totals.qty}</span></div>
              <div class="quotation-print__totals-row"><span>Subtotal</span><span>{formatMoney(p().totals.subtotal)}</span></div>
              <div class="quotation-print__totals-row"><span>Sales Tax</span><span>{formatMoney(p().totals.tax_total)}</span></div>
              <div class="quotation-print__totals-row"><span>Grand Total</span><span>{formatMoney(p().totals.grand_total)}</span></div>
            </div>
            <PrintBrandingFooter class="quotation-print__footer" />
          </article>
        )}
      </Show>
    </div>
  );
}

export default function CollectiveInvoiceSlipPrintPage() {
  return (
    <ProtectedRoute>
      <PrintView />
    </ProtectedRoute>
  );
}
