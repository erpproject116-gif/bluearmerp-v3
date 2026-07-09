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
  fetchPurchaseRequestPrint,
  formatMoney,
  formatPrintDate,
  partyContact,
  type PurchaseRequestPrintPayload,
} from "./purchaseRequestPrint";
import { progressStatusLabel } from "./progressStatus";
import { PrintBrandingHeader } from "../../../shared/branding/PrintBrandingHeader";
import { PrintBrandingFooter } from "../../../shared/branding/PrintBrandingFooter";
import "../../quotation/quotation/quotationPrint.css";
import { PrintLoading } from "../../../shared/LoadingText";

function PurchaseRequestPrintView() {
  const params = useParams<{ purchaseRequestId: string }>();
  const [data] = createResource(
    () => Number(params.purchaseRequestId),
    async (id) => {
      if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid purchase request id.");
      const res = await fetchPurchaseRequestPrint(id);
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

function PrintDocument(props: { payload: PurchaseRequestPrintPayload }) {
  const p = () => props.payload;
  const pr = () => p().purchase_request;
  const lines = () => (pr().lines ?? []) as DocumentLineRow[];
  const layout = useDocumentLinePrintLayout();

  return (
    <>
    <article class="quotation-print__page">
      <PrintBrandingHeader
        docTitle="Purchase Request"
        docSubtitle={pr().purchase_request_no}
        tenantFallbackName={p().tenant.company_name}
      />

      <section class="quotation-print__grid">
        <div>
          <h3 class="quotation-print__section">Purchase Request Details</h3>
          <dl class="quotation-print__dl">
            <dt>Date-no</dt>
            <dd>{pr().date_no_display}</dd>
            <dt>Request date</dt>
            <dd>{formatPrintDate(pr().request_date)}</dd>
            <dt>Transaction type</dt>
            <dd>{pr().tax_type_name ?? "—"}</dd>
            <dt>Currency</dt>
            <dd>{pr().currency_code ?? "—"}</dd>
            <dt>Location</dt>
            <dd>{pr().location_name ?? "—"}</dd>
            <dt>PIC</dt>
            <dd>{pr().pic_name || "—"}</dd>
            <dt>Progress</dt>
            <dd>{progressStatusLabel(pr().progress_status)}</dd>
            <dt>Send status</dt>
            <dd class="capitalize">{pr().send_status}</dd>
            <dt>Domestic / Foreign</dt>
            <dd class="capitalize">{pr().domestic_foreign}</dd>
            <Show when={pr().cc}>
              <dt>Cc</dt>
              <dd>{pr().cc}</dd>
            </Show>
            <Show when={pr().reference}>
              <dt>Reference</dt>
              <dd>{pr().reference}</dd>
            </Show>
          </dl>
        </div>
        <div>
          <h3 class="quotation-print__section">Partner</h3>
          <dl class="quotation-print__dl">
            <dt>Name</dt>
            <dd>{p().partner.company_name || pr().partner_name || "—"}</dd>
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
          <span>{formatMoney(pr().subtotal, pr().currency_code)}</span>
        </div>
        <div class="quotation-print__totals-row">
          <span>Tax</span>
          <span>{formatMoney(pr().tax_total, pr().currency_code)}</span>
        </div>
        <div class="quotation-print__totals-row">
          <span>Grand Total</span>
          <span>{formatMoney(pr().grand_total, pr().currency_code)}</span>
        </div>
      </div>

      <Show when={pr().notes}>
        <section class="quotation-print__notes">
          <h3 class="quotation-print__section">Notes</h3>
          <p>{pr().notes}</p>
        </section>
      </Show>

      <footer class="quotation-print__signatures">
        <div class="quotation-print__sig">
          <div class="quotation-print__sig-line" />
          <p>Prepared by</p>
        </div>
        <div class="quotation-print__sig">
          <div class="quotation-print__sig-line" />
          <p>Approved by</p>
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

export function PurchaseRequestPrintPage() {
  return (
    <ProtectedRoute>
      <PurchaseRequestPrintView />
    </ProtectedRoute>
  );
}

export default PurchaseRequestPrintPage;
