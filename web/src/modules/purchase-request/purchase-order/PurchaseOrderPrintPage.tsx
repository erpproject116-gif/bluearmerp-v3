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
  fetchPurchaseOrderPrint,
  formatMoney,
  formatPrintDate,
  partyContact,
  type PurchaseOrderPrintPayload,
} from "./purchaseOrderPrint";
import { PrintBrandingHeader } from "../../../shared/branding/PrintBrandingHeader";
import { PrintBrandingFooter } from "../../../shared/branding/PrintBrandingFooter";
import "../../quotation/quotation/quotationPrint.css";

function PurchaseOrderPrintView() {
  const params = useParams<{ purchaseOrderId: string }>();
  const [data] = createResource(
    () => Number(params.purchaseOrderId),
    async (id) => {
      if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid purchase order id.");
      const res = await fetchPurchaseOrderPrint(id);
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

function PrintDocument(props: { payload: PurchaseOrderPrintPayload }) {
  const p = () => props.payload;
  const po = () => p().purchase_order;
  const lines = (): DocumentLineRow[] =>
    (po().lines ?? []).map((ln) => ({
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
          docTitle="Purchase Order"
          docSubtitle={po().purchase_order_no}
          tenantFallbackName={p().tenant.company_name}
        />
        <section class="quotation-print__grid">
          <div>
            <h3 class="quotation-print__section">Order Details</h3>
            <dl class="quotation-print__dl">
              <dt>Date-no</dt>
              <dd>{po().date_no_display}</dd>
              <dt>Order date</dt>
              <dd>{formatPrintDate(po().order_date)}</dd>
              <dt>Transaction type</dt>
              <dd>{po().tax_type_name ?? "—"}</dd>
              <dt>Currency</dt>
              <dd>{po().currency_code ?? "—"}</dd>
              <dt>Location</dt>
              <dd>{po().location_name ?? "—"}</dd>
              <dt>PIC</dt>
              <dd>{po().pic_name || "—"}</dd>
              <dt>Status</dt>
              <dd>{po().status}</dd>
            </dl>
          </div>
          <div>
            <h3 class="quotation-print__section">Vendor</h3>
            <p class="quotation-print__party-name">{p().partner.company_name || po().partner_name}</p>
            <Show when={p().partner.address}>
              <p class="quotation-print__party-line">{p().partner.address}</p>
            </Show>
            <p class="quotation-print__party-line">{partyContact(p().partner)}</p>
          </div>
        </section>
        <DocumentLinePrintTable
          lines={lines}
          formatMoney={(n) => formatMoney(n, po().currency_code)}
          layout={layout}
        />
        <div class="quotation-print__totals">
          <div class="quotation-print__totals-row">
            <span>Subtotal</span>
            <span>{formatMoney(po().subtotal, po().currency_code)}</span>
          </div>
          <div class="quotation-print__totals-row">
            <span>Tax</span>
            <span>{formatMoney(po().tax_total, po().currency_code)}</span>
          </div>
          <div class="quotation-print__totals-row">
            <span>Grand Total</span>
            <span>{formatMoney(po().grand_total, po().currency_code)}</span>
          </div>
        </div>
        <Show when={po().notes}>
          <section class="quotation-print__notes">
            <h3 class="quotation-print__section">Notes</h3>
            <p>{po().notes}</p>
          </section>
        </Show>
        <PrintBrandingFooter />
      </article>
      <PrintToolbar onPrint={() => window.print()} />
    </>
  );
}

export function PurchaseOrderPrintPage() {
  return (
    <ProtectedRoute>
      <PurchaseOrderPrintView />
    </ProtectedRoute>
  );
}

export default PurchaseOrderPrintPage;
