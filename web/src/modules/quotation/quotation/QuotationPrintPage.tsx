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
  fetchQuotationPrint,
  formatMoney,
  formatPrintDate,
  partyContact,
  type QuotationPrintPayload,
} from "./quotationPrint";
import { progressStatusLabel } from "./progressStatus";
import { PrintBrandingHeader } from "../../../shared/branding/PrintBrandingHeader";
import { PrintBrandingFooter } from "../../../shared/branding/PrintBrandingFooter";
import { uiLabel } from "../../../shared/branding/uiLabel";
import { PrintLoading } from "../../../shared/LoadingText";
import "./quotationPrint.css";

function QuotationPrintView() {
  const params = useParams<{ quotationId: string }>();
  const [data] = createResource(
    () => Number(params.quotationId),
    async (id) => {
      if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid quotation id.");
      const res = await fetchQuotationPrint(id);
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

function PrintDocument(props: { payload: QuotationPrintPayload }) {
  const p = () => props.payload;
  const q = () => p().quotation;
  const lines = () => (q().lines ?? []) as DocumentLineRow[];
  const layout = useDocumentLinePrintLayout();

  return (
    <>
      <article class="quotation-print__page">
        <PrintBrandingHeader
          docTitle="Quotation"
          docSubtitle={q().reference_no}
          tenantFallbackName={p().tenant.company_name}
        />

        <section class="quotation-print__grid">
          <div>
            <h3 class="quotation-print__section">{uiLabel("print.quotation_details")}</h3>
            <dl class="quotation-print__dl">
              <dt>Document no.</dt>
              <dd>{q().date_no_display}</dd>
              <dt>Date</dt>
              <dd>{formatPrintDate(q().order_date)}</dd>
              <dt>Transaction type</dt>
              <dd>{q().tax_type_name ?? "—"}</dd>
              <dt>Currency</dt>
              <dd>{q().currency_code ?? "—"}</dd>
              <dt>Location</dt>
              <dd>{q().location_name ?? "—"}</dd>
              <dt>PIC</dt>
              <dd>{q().pic_name || "—"}</dd>
              <dt>Progress</dt>
              <dd>{progressStatusLabel(q().progress_status)}</dd>
              <Show when={q().valid_until}>
                <dt>Valid until</dt>
                <dd>{formatPrintDate(q().valid_until)}</dd>
              </Show>
            </dl>
          </div>
          <div>
            <h3 class="quotation-print__section">{uiLabel("print.customer")}</h3>
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
            <span>{uiLabel("print.subtotal")}</span>
            <span>{formatMoney(q().subtotal, q().currency_code)}</span>
          </div>
          <div class="quotation-print__totals-row">
            <span>{uiLabel("print.tax")}</span>
            <span>{formatMoney(q().tax_total, q().currency_code)}</span>
          </div>
          <div class="quotation-print__totals-row">
            <span>{uiLabel("print.grand_total")}</span>
            <span>{formatMoney(q().grand_total, q().currency_code)}</span>
          </div>
        </div>

        <Show when={q().payment_terms}>
          <section class="quotation-print__notes">
            <h3 class="quotation-print__section">{uiLabel("print.payment_terms")}</h3>
            <p>{q().payment_terms}</p>
          </section>
        </Show>
        <Show when={q().notes}>
          <section class="quotation-print__notes">
            <h3 class="quotation-print__section">{uiLabel("print.notes")}</h3>
            <p>{q().notes}</p>
          </section>
        </Show>

        <footer class="quotation-print__signatures">
          <div class="quotation-print__sig">
            <div class="quotation-print__sig-line" />
            <p>{uiLabel("print.prepared_by")}</p>
          </div>
          <div class="quotation-print__sig">
            <div class="quotation-print__sig-line" />
            <p>{uiLabel("print.customer_acceptance")}</p>
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

export function QuotationPrintPage() {
  return (
    <ProtectedRoute>
      <QuotationPrintView />
    </ProtectedRoute>
  );
}

export default QuotationPrintPage;
