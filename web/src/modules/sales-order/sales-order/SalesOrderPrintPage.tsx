import { createResource, Show } from "solid-js";
import { useParams } from "@solidjs/router";
import { ProtectedRoute } from "../../../shared/ProtectedRoute";
import {
  DOCUMENT_LINE_COLUMN_META,
  DocumentLinePrintTable,
  useDocumentLinePrintLayout,
  type DocumentLineRow,
} from "../../../shared/documentLinePrint";
import { PrintToolbar } from "../../../shared/PrintToolbar";
import {
  fetchSalesOrderPrint,
  formatMoney,
  formatPrintDate,
  partyContact,
  type SalesOrderPrintPayload,
} from "./salesOrderPrint";
import { progressStatusLabel } from "./progressStatus";
import { PrintBrandingHeader } from "../../../shared/branding/PrintBrandingHeader";
import { PrintBrandingFooter } from "../../../shared/branding/PrintBrandingFooter";
import "../../quotation/quotation/quotationPrint.css";
import { PrintLoading } from "../../../shared/LoadingText";

function SalesOrderPrintView() {
  const params = useParams<{ salesOrderId: string }>();
  const [data] = createResource(
    () => Number(params.salesOrderId),
    async (id) => {
      if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid sales order id.");
      const res = await fetchSalesOrderPrint(id);
      if (!res.success || !res.data) throw new Error(res.message ?? "Failed to load print data.");
      return res.data;
    },
  );

  return (
    <div class="quotation-print">
      <Show when={data.loading}>
        <PrintLoading />
      </Show>
      <Show when={data.error}>
        <p class="quotation-print__error">{String(data.error)}</p>
      </Show>
      <Show when={data()}>{(payload) => <PrintDocument payload={payload()} />}</Show>
    </div>
  );
}

function PrintDocument(props: { payload: SalesOrderPrintPayload }) {
  const p = () => props.payload;
  const so = () => p().sales_order;
  const lines = () => (so().lines ?? []) as DocumentLineRow[];
  const layout = useDocumentLinePrintLayout();

  return (
    <>
    <article class="quotation-print__page">
      <PrintBrandingHeader
        docTitle="Sales Order"
        docSubtitle={so().sales_order_no}
        tenantFallbackName={p().tenant.company_name}
      />

      <section class="quotation-print__grid">
        <div>
          <h3 class="quotation-print__section">Sales Order Details</h3>
          <dl class="quotation-print__dl">
            <dt>Date-no</dt>
            <dd>{so().date_no_display}</dd>
            <dt>Date</dt>
            <dd>{formatPrintDate(so().order_date)}</dd>
            <dt>Transaction type</dt>
            <dd>{so().tax_type_name ?? "—"}</dd>
            <dt>Currency</dt>
            <dd>{so().currency_code ?? "—"}</dd>
            <dt>Location</dt>
            <dd>{so().location_name ?? "—"}</dd>
            <dt>PIC</dt>
            <dd>{so().pic_name || "—"}</dd>
            <dt>Progress</dt>
            <dd>{progressStatusLabel(so().progress_status)}</dd>
            <Show when={so().due_date}>
              <dt>Due date</dt>
              <dd>{formatPrintDate(so().due_date)}</dd>
            </Show>
            <Show when={so().delivery_date}>
              <dt>Delivery date</dt>
              <dd>{formatPrintDate(so().delivery_date)}</dd>
            </Show>
            <Show when={so().reference}>
              <dt>Reference</dt>
              <dd>{so().reference}</dd>
            </Show>
          </dl>
        </div>
        <div>
          <h3 class="quotation-print__section">Customer</h3>
          <dl class="quotation-print__dl">
            <dt>Name</dt>
            <dd>{p().partner.company_name}</dd>
            <Show when={p().partner.address}>
              <dt>Address</dt>
              <dd>{p().partner.address}</dd>
            </Show>
            <dt>Contact</dt>
            <dd>{partyContact(p().partner)}</dd>
          </dl>
        </div>
      </section>

      <DocumentLinePrintTable lines={lines} formatMoney={(n) => formatMoney(n)} layout={layout} />

      <div class="quotation-print__totals">
        <div class="quotation-print__totals-row">
          <span>Subtotal</span>
          <span>{formatMoney(so().subtotal, so().currency_code)}</span>
        </div>
        <div class="quotation-print__totals-row">
          <span>Tax</span>
          <span>{formatMoney(so().tax_total, so().currency_code)}</span>
        </div>
        <div class="quotation-print__totals-row">
          <span>Grand Total</span>
          <span>{formatMoney(so().grand_total, so().currency_code)}</span>
        </div>
      </div>

      <Show when={so().payment_terms}>
        <section class="quotation-print__notes">
          <h3 class="quotation-print__section">Payment Terms</h3>
          <p>{so().payment_terms}</p>
        </section>
      </Show>
      <Show when={so().delivery_remarks}>
        <section class="quotation-print__notes">
          <h3 class="quotation-print__section">Delivery Remarks</h3>
          <p>{so().delivery_remarks}</p>
        </section>
      </Show>
      <Show when={so().notes}>
        <section class="quotation-print__notes">
          <h3 class="quotation-print__section">Notes</h3>
          <p>{so().notes}</p>
        </section>
      </Show>

      <footer class="quotation-print__signatures">
        <div class="quotation-print__sig">
          <div class="quotation-print__sig-line" />
          <p>Prepared by</p>
        </div>
        <div class="quotation-print__sig">
          <div class="quotation-print__sig-line" />
          <p>Customer Acceptance</p>
        </div>
      </footer>

      <PrintBrandingFooter
        class="quotation-print__footer"
        defaultFooter={`Generated from BluearmERP · ${new Date().toLocaleString()}`}
      />
    </article>
    <PrintToolbar
      layout={{
        columns: DOCUMENT_LINE_COLUMN_META,
        hiddenColumns: layout.hiddenColumns,
        onToggleColumn: layout.toggleColumn,
        onShowAll: layout.showAll,
      }}
      onPrint={() => window.print()}
      onClose={() => window.close()}
    />
    </>
  );
}

export function SalesOrderPrintPage() {
  return (
    <ProtectedRoute>
      <SalesOrderPrintView />
    </ProtectedRoute>
  );
}

export default SalesOrderPrintPage;
