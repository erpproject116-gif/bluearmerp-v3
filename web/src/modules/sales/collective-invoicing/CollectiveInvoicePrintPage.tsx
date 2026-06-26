import { createEffect, createResource, createSignal, Show } from "solid-js";
import { useParams, useSearchParams } from "@solidjs/router";
import { ProtectedRoute } from "../../../shared/ProtectedRoute";
import { apiFetch } from "../../../shared/api";
import { PrintBrandingHeader } from "../../../shared/branding/PrintBrandingHeader";
import { PrintBrandingFooter } from "../../../shared/branding/PrintBrandingFooter";
import { PrintPageSettingsModal } from "../../../shared/PrintPageSettingsModal";
import { applyPrintPageSettings, loadPrintPageSettings } from "../../../shared/printPageSettings";
import { formatMoney, formatPrintDate, partyContact } from "../sales/salesPrint";
import "../../quotation/quotation/quotationPrint.css";

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

function PrintView() {
  const params = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const mode = () => (searchParams.mode === "ar_statement" ? "ar_statement" : "voucher");

  const [data] = createResource(
    () => ({ id: Number(params.id), mode: mode() }),
    async ({ id, mode: m }) => {
      if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid invoice id.");
      const res = await apiFetch<InvoicePrintPayload>(
        `/api/v1/sales/collective-invoices/${id}/print-invoice?mode=${m}`,
      );
      if (!res.success || !res.data) throw new Error(res.message ?? "Failed to load invoice.");
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
