import { createResource, Show } from "solid-js";
import { useParams } from "@solidjs/router";
import { ProtectedRoute } from "../../../shared/ProtectedRoute";
import {
  DocumentLinePrintTable,
  useDocumentLinePrintLayout,
  type DocumentLineRow,
} from "../../../shared/documentLinePrint";
import { PrintToolbar } from "../../../shared/PrintToolbar";
import {
  fetchSupplierInvoicePrint,
  formatMoney,
  formatPrintDate,
  partyContact,
  type SupplierInvoicePrintPayload,
} from "./supplierInvoicePrint";
import { PrintBrandingHeader } from "../../../shared/branding/PrintBrandingHeader";
import { PrintBrandingFooter } from "../../../shared/branding/PrintBrandingFooter";
import "../../quotation/quotation/quotationPrint.css";

function SupplierInvoicePrintView() {
  const params = useParams<{ purchaseId: string }>();
  const [data] = createResource(
    () => Number(params.purchaseId),
    async (id) => {
      if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid purchase id.");
      const res = await fetchSupplierInvoicePrint(id);
      if (!res.success || !res.data) throw new Error(res.message ?? "Failed to load print data.");
      return res.data;
    },
  );

  return (
    <div class="quotation-print">
      <Show when={data.loading}>
        <p class="quotation-print__loading">Loading…</p>
      </Show>
      <Show when={data.error}>
        <p class="quotation-print__error">{String(data.error)}</p>
      </Show>
      <Show when={data()}>{(payload) => <PrintDocument payload={payload()} />}</Show>
    </div>
  );
}

function PrintDocument(props: { payload: SupplierInvoicePrintPayload }) {
  const p = () => props.payload;
  const inv = () => p().supplier_invoice;
  const lines = (): DocumentLineRow[] =>
    (inv().lines ?? []).map((ln) => ({
      line_no: ln.line_no,
      item_code: ln.item_code,
      item_name: ln.item_name,
      description: ln.description ?? "",
      qty: ln.qty,
      unit_non_vat: ln.unit_non_vat,
      non_vat_total: ln.non_vat_total,
      tax_amount: ln.tax_amount,
      line_total: ln.line_total,
    }));
  const layout = useDocumentLinePrintLayout();

  return (
    <>
      <article class="quotation-print__page">
        <PrintBrandingHeader
          docTitle="Purchase"
          docSubtitle={inv().invoice_no}
          tenantFallbackName={p().tenant.company_name}
        />
        <section class="quotation-print__grid">
          <div>
            <dl class="quotation-print__dl">
              <dt>Date-no</dt>
              <dd>{inv().date_no_display}</dd>
              <dt>Invoice date</dt>
              <dd>{formatPrintDate(inv().invoice_date)}</dd>
              <dt>Currency</dt>
              <dd>{inv().currency_code ?? "—"}</dd>
              <dt>Progress</dt>
              <dd>{inv().progress_status}</dd>
            </dl>
          </div>
          <div>
            <h3 class="quotation-print__section">Vendor</h3>
            <p class="quotation-print__party-name">{p().partner.company_name || inv().vendor_name}</p>
            <p class="quotation-print__party-line">{partyContact(p().partner)}</p>
          </div>
        </section>
        <DocumentLinePrintTable
          lines={lines}
          formatMoney={(n) => formatMoney(n, inv().currency_code)}
          layout={layout}
        />
        <div class="quotation-print__totals">
          <div class="quotation-print__totals-row">
            <span>Grand Total</span>
            <span>{formatMoney(inv().grand_total, inv().currency_code)}</span>
          </div>
        </div>
        <PrintBrandingFooter />
      </article>
      <PrintToolbar onPrint={() => window.print()} />
    </>
  );
}

export default function SupplierInvoicePrintPage() {
  return (
    <ProtectedRoute>
      <SupplierInvoicePrintView />
    </ProtectedRoute>
  );
}
